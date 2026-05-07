/*
 * Pool store unit tests.
 *
 * Coverage targets:
 *   PS-1. activate() fetches pool + dex_config and computes depth
 *   PS-2. Switching pool tears down old subscription on the SAME Connection
 *         it was registered on (capture-instance pattern)
 *   PS-3. deactivate() is idempotent
 *   PS-4. WS pool event recomputes depth (after debounce)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const POOL_A = new PublicKey('11111111111111111111111111111114');
const POOL_B = new PublicKey('11111111111111111111111111111115');
const DEX_CONFIG_PDA = new PublicKey('11111111111111111111111111111116');
const RWT_MINT = new PublicKey('11111111111111111111111111111117');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('11111111111111111111111111111118'),
	yieldDistribution: new PublicKey('11111111111111111111111111111119'),
	rwtEngine: new PublicKey('1111111111111111111111111111111A'),
	nativeDex: new PublicKey('1111111111111111111111111111111B'),
	futarchy: new PublicKey('1111111111111111111111111111111C')
};

const mocks = vi.hoisted(() => ({
	parsePoolState: vi.fn(),
	parseDexConfig: vi.fn(),
	computeDepth: vi.fn(),
	findDexConfigPda: vi.fn(),
	getAccountInfo: vi.fn(),
	connectionA: {
		onAccountChange: vi.fn(),
		removeAccountChangeListener: vi.fn()
	},
	connectionB: {
		onAccountChange: vi.fn(),
		removeAccountChangeListener: vi.fn()
	},
	wsConnSeq: 0,
	currentNetwork: 'devnet'
}));

vi.mock('@areal/sdk/native-dex', () => ({
	parsePoolState: mocks.parsePoolState,
	parseDexConfig: mocks.parseDexConfig
}));

vi.mock('@areal/sdk/markets', () => ({
	computeDepth: mocks.computeDepth
}));

vi.mock('@areal/sdk/pda', () => ({
	findDexConfigPda: mocks.findDexConfigPda
}));

vi.mock('@areal/sdk/network', () => ({
	RWT_MINTS: {
		localnet: RWT_MINT,
		devnet: RWT_MINT,
		mainnet: RWT_MINT
	}
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return mocks.currentNetwork;
		},
		get connection() {
			return { getAccountInfo: mocks.getAccountInfo };
		},
		get wsConnection() {
			// First subscribe gets connectionA, subsequent cycles get connectionB.
			mocks.wsConnSeq++;
			return mocks.wsConnSeq <= 1 ? mocks.connectionA : mocks.connectionB;
		},
		get endpoint() {
			return { programIds: PROGRAM_IDS };
		}
	}
}));

const FAKE_POOL = {
	tokenAMint: RWT_MINT,
	tokenBMint: RWT_MINT,
	poolType: 0,
	reserveA: 1000n,
	reserveB: 1000n
};
const FAKE_CONFIG = { feeBps: 30 };
const FAKE_DEPTH = { bidSide: [], askSide: [] };

const fakePoolInfo = { data: new Uint8Array([1]), executable: false, lamports: 0, owner: RWT_MINT };
const fakeConfigInfo = { data: new Uint8Array([2]), executable: false, lamports: 0, owner: RWT_MINT };

async function settle(times = 4) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('pool store', () => {
	let poolStore: typeof import('./pool-store.svelte').poolStore;

	beforeEach(async () => {
		vi.useFakeTimers();
		mocks.parsePoolState.mockReset();
		mocks.parseDexConfig.mockReset();
		mocks.computeDepth.mockReset();
		mocks.findDexConfigPda.mockReset();
		mocks.getAccountInfo.mockReset();
		mocks.connectionA.onAccountChange.mockReset();
		mocks.connectionA.removeAccountChangeListener.mockReset();
		mocks.connectionB.onAccountChange.mockReset();
		mocks.connectionB.removeAccountChangeListener.mockReset();
		mocks.wsConnSeq = 0;

		mocks.findDexConfigPda.mockReturnValue([DEX_CONFIG_PDA, 255]);
		mocks.getAccountInfo.mockImplementation((pk: PublicKey) => {
			if (pk.equals(DEX_CONFIG_PDA)) return Promise.resolve(fakeConfigInfo);
			return Promise.resolve(fakePoolInfo);
		});
		mocks.parsePoolState.mockReturnValue(FAKE_POOL);
		mocks.parseDexConfig.mockReturnValue(FAKE_CONFIG);
		mocks.computeDepth.mockReturnValue(FAKE_DEPTH);

		let nextId = 100;
		mocks.connectionA.onAccountChange.mockImplementation(() => nextId++);
		mocks.connectionB.onAccountChange.mockImplementation(() => nextId++);

		const mod = await import('./pool-store.svelte');
		poolStore = mod.poolStore;
		poolStore.deactivate();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('PS-1: activate fetches pool + dex_config and computes depth', async () => {
		await poolStore.activate(POOL_A);
		await settle();

		expect(mocks.getAccountInfo).toHaveBeenCalledTimes(2);
		expect(mocks.parsePoolState).toHaveBeenCalledWith(fakePoolInfo.data);
		expect(mocks.parseDexConfig).toHaveBeenCalledWith(fakeConfigInfo.data);
		expect(mocks.computeDepth).toHaveBeenCalledTimes(1);
		// Svelte 5 wraps $state values in proxies, so identity (===) breaks
		// across the read boundary even for the same source object — fall
		// back to structural equality.
		expect(poolStore.pool).toStrictEqual(FAKE_POOL);
		expect(poolStore.depth).toStrictEqual(FAKE_DEPTH);
		expect(poolStore.isLoading).toBe(false);
	});

	it('PS-2: switching pool tears down old subscription on the same Connection', async () => {
		await poolStore.activate(POOL_A);
		await settle();

		// Two listeners (pool + config) on connectionA.
		expect(mocks.connectionA.onAccountChange).toHaveBeenCalledTimes(2);
		const poolListenerId = mocks.connectionA.onAccountChange.mock.results[0].value;
		const configListenerId = mocks.connectionA.onAccountChange.mock.results[1].value;

		await poolStore.activate(POOL_B);
		await settle();

		// Old listeners removed on connectionA (NOT connectionB).
		expect(mocks.connectionA.removeAccountChangeListener).toHaveBeenCalledWith(poolListenerId);
		expect(mocks.connectionA.removeAccountChangeListener).toHaveBeenCalledWith(configListenerId);
		expect(mocks.connectionB.onAccountChange).toHaveBeenCalledTimes(2);
		expect(mocks.connectionB.removeAccountChangeListener).not.toHaveBeenCalled();
	});

	it('PS-3: deactivate is idempotent', async () => {
		await poolStore.activate(POOL_A);
		await settle();

		const removedBefore = mocks.connectionA.removeAccountChangeListener.mock.calls.length;

		poolStore.deactivate();
		poolStore.deactivate();
		poolStore.deactivate();

		// First deactivate ran teardown; subsequent ones short-circuit.
		const removedAfter = mocks.connectionA.removeAccountChangeListener.mock.calls.length;
		expect(removedAfter - removedBefore).toBe(2); // pool + config = 2 listeners
		expect(poolStore.pool).toBeNull();
		expect(poolStore.depth).toBeNull();
	});

	it('PS-4: WS pool event recomputes depth after debounce', async () => {
		await poolStore.activate(POOL_A);
		await settle();

		// Capture pool listener registered on connectionA.
		const poolListener = mocks.connectionA.onAccountChange.mock.calls[0][1];

		// Initial activate triggered one computeDepth — clear so we count the
		// WS-driven recompute in isolation.
		mocks.computeDepth.mockClear();

		const NEW_POOL_DATA = {
			data: new Uint8Array([99]),
			executable: false,
			lamports: 0,
			owner: RWT_MINT
		};
		poolListener(NEW_POOL_DATA);

		// Before debounce expires: no recompute yet.
		await vi.advanceTimersByTimeAsync(100);
		expect(mocks.computeDepth).not.toHaveBeenCalled();

		// After debounce window: parsePoolState + computeDepth both ran.
		await vi.advanceTimersByTimeAsync(200);
		expect(mocks.parsePoolState).toHaveBeenLastCalledWith(NEW_POOL_DATA.data);
		expect(mocks.computeDepth).toHaveBeenCalledTimes(1);
	});
});
