/*
 * Markets store unit tests.
 *
 * The store under test is a runes-based singleton that:
 *   - reads `network.current` reactively
 *   - calls `getMarketsSnapshot` from `@areal/sdk/markets`
 *   - registers WS subscriptions on `network.wsConnection` for every pool
 *   - exposes a debounced re-fetch + retry surface
 *
 * Strategy: mock the network singleton (reactive `$state` proxy via
 * `test-helpers.svelte.ts`) and the SDK markets entrypoint so we control
 * the snapshot shape + RPC outcome.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { PublicKey } from '@solana/web3.js';

const POOL_A = new PublicKey('11111111111111111111111111111114');
const POOL_B = new PublicKey('11111111111111111111111111111115');
const TOKEN_A = new PublicKey('11111111111111111111111111111116');
const TOKEN_B = new PublicKey('11111111111111111111111111111117');
const RWT_VAULT_PDA = new PublicKey('11111111111111111111111111111118');
const DEX_CONFIG_PDA = new PublicKey('11111111111111111111111111111119');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('1111111111111111111111111111111A'),
	yieldDistribution: new PublicKey('1111111111111111111111111111111B'),
	rwtEngine: new PublicKey('1111111111111111111111111111111C'),
	nativeDex: new PublicKey('1111111111111111111111111111111D'),
	futarchy: new PublicKey('1111111111111111111111111111111E')
};

const mocks = vi.hoisted(() => {
	return {
		wsConnections: [] as Array<{
			id: number;
			onAccountChange: ReturnType<typeof vi.fn>;
			removeAccountChangeListener: ReturnType<typeof vi.fn>;
		}>,
		readConnection: { _read: true },
		getMarketsSnapshot: vi.fn(),
		findRwtVaultPda: vi.fn(),
		findDexConfigPda: vi.fn()
	};
});

vi.mock('$lib/network/network.svelte', async () => {
	const helpers = await import('./test-helpers.svelte');
	return {
		network: {
			get current() {
				return helpers.mockNetworkState.current;
			},
			get connection() {
				return mocks.readConnection;
			},
			get wsConnection() {
				let counter = 0;
				const conn = {
					id: mocks.wsConnections.length,
					onAccountChange: vi.fn(() => ++counter),
					removeAccountChangeListener: vi.fn()
				};
				mocks.wsConnections.push(conn);
				return conn;
			},
			get endpoint() {
				return {
					id: helpers.mockNetworkState.current,
					label: 'Devnet',
					rpcUrl: 'https://api.devnet.solana.com',
					programIds: PROGRAM_IDS,
					usdcMint: PROGRAM_IDS.ownershipToken
				};
			}
		}
	};
});

vi.mock('@areal/sdk/markets', () => ({
	getMarketsSnapshot: mocks.getMarketsSnapshot
}));

vi.mock('@areal/sdk/pda', () => ({
	findRwtVaultPda: mocks.findRwtVaultPda,
	findDexConfigPda: mocks.findDexConfigPda
}));

// `@areal/sdk/network` is imported only for the `ClusterName` type — no
// runtime symbols. A bare empty mock keeps Vitest from resolving against
// the real package (which would pull in @solana/web3.js etc).
vi.mock('@areal/sdk/network', () => ({}));

import { mockNetworkState, resetMockState } from './test-helpers.svelte';

function makeSnapshot(slot = 100) {
	return {
		fetchedAt: 1700000000000,
		slot,
		tokens: [
			{
				mint: TOKEN_A,
				symbol: 'RWT',
				name: 'Areal RWT',
				decimals: 6,
				category: 'protocol' as const,
				priceUsdc: 1.0,
				priceSource: 'direct-usdc' as const,
				nav: 100_000_000n,
				isPlaceholder: false
			},
			{
				mint: TOKEN_B,
				symbol: 'SPRK',
				name: 'Sparkles',
				decimals: 6,
				category: 'ownership' as const,
				priceUsdc: 0.99,
				priceSource: 'direct-usdc' as const,
				nav: null,
				isPlaceholder: false
			}
		],
		pools: [
			{
				poolAddress: POOL_A,
				poolType: 0,
				tokenAMint: TOKEN_A,
				tokenBMint: TOKEN_B,
				reserveA: 10_000_000n,
				reserveB: 10_000_000n,
				feeBps: 30,
				isActive: true,
				hasOtTreasury: false,
				tvlUsdc: 19_900,
				tvlSource: 'exact' as const,
				rawPool: {} as never
			},
			{
				poolAddress: POOL_B,
				poolType: 0,
				tokenAMint: TOKEN_B,
				tokenBMint: TOKEN_A,
				reserveA: 5_000_000n,
				reserveB: 5_000_000n,
				feeBps: 30,
				isActive: true,
				hasOtTreasury: false,
				tvlUsdc: 9_950,
				tvlSource: 'exact' as const,
				rawPool: {} as never
			}
		],
		rwtVault: { navBookValue: 100_000_000n, totalRwtSupply: 100_000_000n }
	};
}

function resetMocks() {
	resetMockState();
	mocks.wsConnections.length = 0;
	mocks.getMarketsSnapshot.mockReset();
	mocks.findRwtVaultPda.mockReset();
	mocks.findDexConfigPda.mockReset();
	mocks.findRwtVaultPda.mockReturnValue([RWT_VAULT_PDA, 255]);
	mocks.findDexConfigPda.mockReturnValue([DEX_CONFIG_PDA, 255]);
}

async function settle(times = 4) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('markets store', () => {
	let store: typeof import('./store.svelte').markets;

	beforeEach(async () => {
		vi.useFakeTimers();
		resetMocks();
		const mod = await import('./store.svelte');
		store = mod.markets;
		store.stop();
	});

	afterEach(() => {
		store?.stop();
		vi.useRealTimers();
	});

	it('start() is idempotent — second start() does not re-fetch', async () => {
		mocks.getMarketsSnapshot.mockResolvedValue(makeSnapshot());
		store.start();
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getMarketsSnapshot).toHaveBeenCalledTimes(1);
	});

	it('start → loading → ready, snapshot populated, subs registered per pool', async () => {
		mocks.getMarketsSnapshot.mockResolvedValue(makeSnapshot());
		store.start();
		flushSync();

		// Synchronously after start, the store should be loading.
		expect(store.status).toBe('loading');

		await settle();
		flushSync();

		expect(store.status).toBe('ready');
		expect(store.tokens.length).toBe(2);
		expect(store.pools.length).toBe(2);
		expect(store.rwtVault).not.toBeNull();

		// 2 pools + 1 dex config + 1 rwt vault = 4 listeners on a single ws conn.
		expect(mocks.wsConnections.length).toBe(1);
		expect(mocks.wsConnections[0].onAccountChange).toHaveBeenCalledTimes(4);
	});

	it('fetch rejects → status: error, error message set', async () => {
		mocks.getMarketsSnapshot.mockRejectedValue(new Error('rpc 502'));
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('error');
		expect(store.error).toBe('rpc 502');
		expect(store.snapshot).toBeNull();
	});

	it('network switch resets snapshot and re-fetches on captured Connection', async () => {
		mocks.getMarketsSnapshot.mockResolvedValue(makeSnapshot());
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(mocks.wsConnections.length).toBe(1);
		const firstWsConn = mocks.wsConnections[0];
		const firstListenerCount = firstWsConn.onAccountChange.mock.calls.length;

		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();
		flushSync();

		// Old listeners removed on the SAME first connection.
		expect(firstWsConn.removeAccountChangeListener).toHaveBeenCalledTimes(firstListenerCount);

		// A second ws connection was created for the new cycle.
		expect(mocks.wsConnections.length).toBe(2);
		expect(mocks.wsConnections[1].onAccountChange).toHaveBeenCalledTimes(4);
		expect(mocks.getMarketsSnapshot).toHaveBeenCalledTimes(2);
	});

	it('two AccountChange events within debounce window collapse to one re-fetch', async () => {
		mocks.getMarketsSnapshot.mockResolvedValue(makeSnapshot());
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getMarketsSnapshot).toHaveBeenCalledTimes(1);

		const ws = mocks.wsConnections[0];
		const cb1 = ws.onAccountChange.mock.calls[0][1];
		const cb2 = ws.onAccountChange.mock.calls[1][1];
		cb1();
		cb2();

		// Advance past debounce window.
		await vi.advanceTimersByTimeAsync(300);
		await settle();
		flushSync();

		// Initial fetch + one debounced re-fetch = 2 total.
		expect(mocks.getMarketsSnapshot).toHaveBeenCalledTimes(2);
	});

	it('stop() tears down all subscriptions on the captured Connection', async () => {
		mocks.getMarketsSnapshot.mockResolvedValue(makeSnapshot());
		store.start();
		flushSync();
		await settle();
		flushSync();

		const ws = mocks.wsConnections[0];
		const subscribed = ws.onAccountChange.mock.calls.length;

		store.stop();

		expect(ws.removeAccountChangeListener).toHaveBeenCalledTimes(subscribed);
		expect(store.status).toBe('idle');
		expect(store.snapshot).toBeNull();
	});

	it('late RPC response after network switch is discarded', async () => {
		// First fetch (devnet) resolves slowly; second (mainnet) resolves fast.
		let resolveFirst: (v: unknown) => void;
		const slowPromise = new Promise((r) => {
			resolveFirst = r;
		});
		const slowSnap = makeSnapshot(50);
		const fastSnap = makeSnapshot(200);

		mocks.getMarketsSnapshot.mockImplementationOnce(() => slowPromise);
		mocks.getMarketsSnapshot.mockResolvedValueOnce(fastSnap);

		store.start();
		flushSync();
		await settle();

		// Switch network BEFORE first fetch resolves.
		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();
		flushSync();
		// Drain second fetch.
		await settle();
		flushSync();

		expect(store.snapshot?.slot).toBe(200);

		// Now resolve the stale first call. The activeNetwork guard should
		// drop the result.
		resolveFirst!(slowSnap);
		await settle();
		flushSync();

		// State still reflects the second (mainnet) fetch.
		expect(store.snapshot?.slot).toBe(200);
	});

	it('refresh() while pending returns the same Promise', async () => {
		let resolve: (v: unknown) => void;
		const promise = new Promise((r) => {
			resolve = r;
		});
		mocks.getMarketsSnapshot.mockImplementation(() => promise);

		store.start();
		flushSync();
		// Drain effect microtasks so the first refresh() has fired.
		await settle(2);

		const p1 = store.refresh();
		const p2 = store.refresh();
		expect(p1).toBe(p2);

		resolve!(makeSnapshot());
		await Promise.all([p1, p2]);
	});
});
