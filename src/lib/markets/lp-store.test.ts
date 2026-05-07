/*
 * LP store unit tests.
 *
 * Coverage targets:
 *   LP-1. activate() fetches LpPosition + opens WS sub on captured Connection
 *   LP-2. Switching (pool, wallet) tears down OLD subscription on the
 *         instance it was registered on
 *   LP-3. deactivate() is idempotent
 *   LP-4. Late-response guard drops mismatched RPC results
 *   LP-5. WS event triggers debounced position recompute
 *   LP-6. Position null when LpPosition account does not exist (init branch)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const POOL_A = new PublicKey('11111111111111111111111111111114');
const POOL_B = new PublicKey('11111111111111111111111111111115');
const WALLET_A = new PublicKey('11111111111111111111111111111116');
const WALLET_B = new PublicKey('11111111111111111111111111111117');
const LP_PDA_A = new PublicKey('11111111111111111111111111111118');
const LP_PDA_B = new PublicKey('11111111111111111111111111111119');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('1111111111111111111111111111111A'),
	yieldDistribution: new PublicKey('1111111111111111111111111111111B'),
	rwtEngine: new PublicKey('1111111111111111111111111111111C'),
	nativeDex: new PublicKey('1111111111111111111111111111111D'),
	futarchy: new PublicKey('1111111111111111111111111111111E')
};

const mocks = vi.hoisted(() => ({
	parseLpPosition: vi.fn(),
	findLpPositionPda: vi.fn(),
	getAccountInfo: vi.fn(),
	connectionA: {
		onAccountChange: vi.fn(),
		removeAccountChangeListener: vi.fn()
	},
	connectionB: {
		onAccountChange: vi.fn(),
		removeAccountChangeListener: vi.fn()
	},
	wsConnSeq: 0
}));

vi.mock('@areal/sdk/native-dex', () => ({
	parseLpPosition: mocks.parseLpPosition
}));

vi.mock('@areal/sdk/pda', () => ({
	findLpPositionPda: mocks.findLpPositionPda
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return 'devnet';
		},
		get connection() {
			return { getAccountInfo: mocks.getAccountInfo };
		},
		get wsConnection() {
			mocks.wsConnSeq++;
			return mocks.wsConnSeq <= 1 ? mocks.connectionA : mocks.connectionB;
		},
		get endpoint() {
			return { programIds: PROGRAM_IDS };
		}
	}
}));

const FAKE_LP = { shares: 1000n, pool: POOL_A, owner: WALLET_A };
const fakeLpInfo = { data: new Uint8Array([1, 2, 3]), executable: false, lamports: 0, owner: PROGRAM_IDS.nativeDex };

async function settle(times = 4) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('lp store', () => {
	let lpStore: typeof import('./lp-store.svelte').lpStore;

	beforeEach(async () => {
		vi.useFakeTimers();
		mocks.parseLpPosition.mockReset();
		mocks.findLpPositionPda.mockReset();
		mocks.getAccountInfo.mockReset();
		mocks.connectionA.onAccountChange.mockReset();
		mocks.connectionA.removeAccountChangeListener.mockReset();
		mocks.connectionB.onAccountChange.mockReset();
		mocks.connectionB.removeAccountChangeListener.mockReset();
		mocks.wsConnSeq = 0;

		// Default: A pool/wallet → LP_PDA_A; B → LP_PDA_B.
		mocks.findLpPositionPda.mockImplementation(
			(pool: PublicKey, owner: PublicKey): [PublicKey, number] => {
				if (pool.equals(POOL_A) && owner.equals(WALLET_A)) return [LP_PDA_A, 255];
				if (pool.equals(POOL_B) && owner.equals(WALLET_B)) return [LP_PDA_B, 255];
				return [LP_PDA_B, 255];
			}
		);
		mocks.getAccountInfo.mockResolvedValue(fakeLpInfo);
		mocks.parseLpPosition.mockReturnValue(FAKE_LP);

		let nextId = 100;
		mocks.connectionA.onAccountChange.mockImplementation(() => nextId++);
		mocks.connectionB.onAccountChange.mockImplementation(() => nextId++);

		const mod = await import('./lp-store.svelte');
		lpStore = mod.lpStore;
		lpStore.deactivate();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('LP-1: activate fetches LpPosition + opens WS sub', async () => {
		await lpStore.activate(POOL_A, WALLET_A);
		await settle();

		expect(mocks.findLpPositionPda).toHaveBeenCalledWith(
			POOL_A,
			WALLET_A,
			PROGRAM_IDS.nativeDex
		);
		expect(mocks.getAccountInfo).toHaveBeenCalledWith(LP_PDA_A);
		expect(mocks.connectionA.onAccountChange).toHaveBeenCalledTimes(1);
		expect(lpStore.position).toStrictEqual(FAKE_LP);
		expect(lpStore.hasPosition).toBe(true);
		expect(lpStore.isLoading).toBe(false);
	});

	it('LP-2: switching tuple tears down OLD sub on the same Connection', async () => {
		await lpStore.activate(POOL_A, WALLET_A);
		await settle();

		const oldListenerId = mocks.connectionA.onAccountChange.mock.results[0].value;

		await lpStore.activate(POOL_B, WALLET_B);
		await settle();

		expect(mocks.connectionA.removeAccountChangeListener).toHaveBeenCalledWith(oldListenerId);
		expect(mocks.connectionB.onAccountChange).toHaveBeenCalledTimes(1);
		expect(mocks.connectionB.removeAccountChangeListener).not.toHaveBeenCalled();
	});

	it('LP-3: deactivate is idempotent', async () => {
		await lpStore.activate(POOL_A, WALLET_A);
		await settle();

		const beforeRemoves = mocks.connectionA.removeAccountChangeListener.mock.calls.length;
		lpStore.deactivate();
		lpStore.deactivate();
		lpStore.deactivate();

		const afterRemoves = mocks.connectionA.removeAccountChangeListener.mock.calls.length;
		// Only the first deactivate() runs teardown — single listener removed.
		expect(afterRemoves - beforeRemoves).toBe(1);
		expect(lpStore.position).toBeNull();
		expect(lpStore.positionAddress).toBeNull();
	});

	it('LP-4: late-response guard drops result on tuple change', async () => {
		// First activate triggers the RPC; we'll resolve it AFTER the user
		// switched to a new pool/wallet.
		let resolveFirst: (v: typeof fakeLpInfo) => void = () => {};
		mocks.getAccountInfo
			.mockReturnValueOnce(
				new Promise((r) => {
					resolveFirst = r;
				})
			)
			.mockResolvedValueOnce(fakeLpInfo);

		const FAKE_LP_LATE = { shares: 9999n, pool: POOL_A, owner: WALLET_A };
		const fakeLateInfo = { ...fakeLpInfo, data: new Uint8Array([7, 7, 7]) };

		// LP_PDA_A's parse returns FAKE_LP_LATE (the stale RPC); LP_PDA_B's
		// parse returns FAKE_LP (the current tuple's data). The store should
		// surface FAKE_LP, not FAKE_LP_LATE.
		mocks.parseLpPosition.mockReset();
		mocks.parseLpPosition.mockImplementation((data: Uint8Array) => {
			if (data[0] === 7) return FAKE_LP_LATE;
			return FAKE_LP;
		});

		const p1 = lpStore.activate(POOL_A, WALLET_A);
		// Switch tuple BEFORE the first fetch resolves.
		const p2 = lpStore.activate(POOL_B, WALLET_B);
		await settle();

		// Now resolve the stale fetch.
		resolveFirst(fakeLateInfo);
		await settle();
		await Promise.all([p1, p2]);

		// Position must reflect the SECOND tuple's data, not the late
		// resolution of the first.
		expect(lpStore.position).toStrictEqual(FAKE_LP);
	});

	it('LP-5: WS event triggers debounced position recompute', async () => {
		await lpStore.activate(POOL_A, WALLET_A);
		await settle();

		const wsListener = mocks.connectionA.onAccountChange.mock.calls[0][1];

		// Update parser to return a different position on the WS payload.
		const FAKE_LP_NEXT = { shares: 2000n, pool: POOL_A, owner: WALLET_A };
		mocks.parseLpPosition.mockReturnValueOnce(FAKE_LP_NEXT);

		const NEW_DATA = {
			data: new Uint8Array([9, 9, 9]),
			executable: false,
			lamports: 0,
			owner: PROGRAM_IDS.nativeDex
		};
		wsListener(NEW_DATA);

		// Before debounce window: no update yet.
		await vi.advanceTimersByTimeAsync(100);
		expect(lpStore.position).toStrictEqual(FAKE_LP);

		// After debounce: WS payload parsed and applied.
		await vi.advanceTimersByTimeAsync(200);
		expect(mocks.parseLpPosition).toHaveBeenLastCalledWith(NEW_DATA.data);
		expect(lpStore.position).toStrictEqual(FAKE_LP_NEXT);
	});

	it('LP-6: position null when LpPosition account does not exist', async () => {
		mocks.getAccountInfo.mockReset();
		mocks.getAccountInfo.mockResolvedValue(null);

		await lpStore.activate(POOL_A, WALLET_A);
		await settle();

		expect(lpStore.position).toBeNull();
		expect(lpStore.hasPosition).toBe(false);
		expect(lpStore.isLoading).toBe(false);
		// Parser should not have been called — no data to parse.
		expect(mocks.parseLpPosition).not.toHaveBeenCalled();
	});
});
