/*
 * Portfolio store unit tests.
 *
 * The store under test is a runes-based singleton that:
 *   - reads `wallet.publicKey` + `network.current` reactively
 *   - calls `getHolderPortfolio` from `@areal/sdk/portfolio`
 *   - registers WS subscriptions on `network.wsConnection`
 *   - exposes a debounced re-fetch + retry surface
 *
 * Strategy: mock the wallet + network singletons. The mock state is backed
 * by reactive `$state()` proxies (see `test-helpers.svelte.ts`) so mutating
 * them in a test triggers the store's `$effect` exactly the way the real
 * singletons would.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { PublicKey } from '@solana/web3.js';

// --------------------------------------------------------------------------
// Mock setup. `vi.hoisted` ensures these are available when vi.mock factories
// (also hoisted) reference them.
// --------------------------------------------------------------------------

const HOLDER_A = new PublicKey('11111111111111111111111111111112');
const HOLDER_B = new PublicKey('11111111111111111111111111111113');
const ATA_A = new PublicKey('11111111111111111111111111111114');
const CLAIM_STATUS_A = new PublicKey('11111111111111111111111111111115');
const DISTRIBUTOR_A = new PublicKey('11111111111111111111111111111116');
const OT_MINT_A = new PublicKey('11111111111111111111111111111117');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('11111111111111111111111111111118'),
	yieldDistribution: new PublicKey('11111111111111111111111111111119'),
	rwtEngine: new PublicKey('1111111111111111111111111111111A'),
	nativeDex: new PublicKey('1111111111111111111111111111111B'),
	futarchy: new PublicKey('1111111111111111111111111111111C')
};

const mocks = vi.hoisted(() => {
	return {
		// Each call to `wsConnection` getter returns a fresh Connection-like
		// stub. Tests assert the store still uses the same instance for
		// register + remove via the cycle-tracked reference.
		wsConnections: [] as Array<{
			id: number;
			onAccountChange: ReturnType<typeof vi.fn>;
			removeAccountChangeListener: ReturnType<typeof vi.fn>;
		}>,
		readConnection: { _read: true },
		getHolderPortfolio: vi.fn(),
		findClaimStatusPda: vi.fn(),
		findMerkleDistributorPda: vi.fn()
	};
});

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_PROOF_STORE_URL: 'https://test-proof-store.example'
	}
}));

vi.mock('$lib/stores/wallet.svelte', async () => {
	const helpers = await import('./test-helpers.svelte');
	return {
		wallet: {
			get publicKey() {
				return helpers.mockWalletState.publicKey;
			},
			get isConnected() {
				return helpers.mockWalletState.isConnected;
			}
		}
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

vi.mock('@areal/sdk/portfolio', () => ({
	getHolderPortfolio: mocks.getHolderPortfolio
}));

vi.mock('@areal/sdk/pda', () => ({
	findClaimStatusPda: mocks.findClaimStatusPda,
	findMerkleDistributorPda: mocks.findMerkleDistributorPda
}));

import { mockWalletState, mockNetworkState, resetMockState } from './test-helpers.svelte';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeSnapshot(holder: PublicKey) {
	return {
		holder,
		fetchedAt: 1700000000000,
		slot: 100,
		rows: [
			{
				otMint: OT_MINT_A,
				metadata: { name: 'Test OT', symbol: 'TOT', decimals: 6 },
				balance: 1_500_000n,
				distributor: DISTRIBUTOR_A,
				cumulativeAmount: 100n,
				claimedAmount: 30n,
				claimableNow: 70n,
				ataAddress: ATA_A
			}
		]
	};
}

function resetMocks() {
	resetMockState();
	mocks.wsConnections.length = 0;
	mocks.getHolderPortfolio.mockReset();
	mocks.findClaimStatusPda.mockReset();
	mocks.findMerkleDistributorPda.mockReset();
	mocks.findClaimStatusPda.mockReturnValue([CLAIM_STATUS_A, 255]);
	mocks.findMerkleDistributorPda.mockReturnValue([DISTRIBUTOR_A, 255]);
}

/** Yield enough times for the microtask queue to drain promise chains. */
async function settle(times = 4) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('portfolio store', () => {
	let store: typeof import('./store.svelte').portfolio;

	beforeEach(async () => {
		vi.useFakeTimers();
		resetMocks();
		// Import once — singleton survives across tests, and `stop()` between
		// tests fully resets internal state. `vi.resetModules()` would re-
		// instantiate the test-helper $state proxy, breaking the mock-state
		// reference held at the top of this file.
		const mod = await import('./store.svelte');
		store = mod.portfolio;
		store.stop();
	});

	afterEach(() => {
		store?.stop();
		vi.useRealTimers();
	});

	it('start() is idempotent', () => {
		store.start();
		store.start();
		flushSync();
		expect(mocks.getHolderPortfolio).not.toHaveBeenCalled();
	});

	it('disconnected on start → idle, no fetch', () => {
		store.start();
		flushSync();
		expect(store.status).toBe('idle');
		expect(store.snapshot).toBeNull();
		expect(mocks.getHolderPortfolio).not.toHaveBeenCalled();
	});

	it('connect → fetch called with holder + program ids + proof url', async () => {
		mocks.getHolderPortfolio.mockResolvedValue(makeSnapshot(HOLDER_A));
		store.start();

		mockWalletState.publicKey = HOLDER_A;
		mockWalletState.isConnected = true;
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getHolderPortfolio).toHaveBeenCalledTimes(1);
		const [conn, holder, opts] = mocks.getHolderPortfolio.mock.calls[0];
		expect(conn).toBe(mocks.readConnection);
		expect(holder).toBe(HOLDER_A);
		expect(opts.ownershipTokenProgramId).toBe(PROGRAM_IDS.ownershipToken);
		expect(opts.yieldDistributionProgramId).toBe(PROGRAM_IDS.yieldDistribution);
		expect(opts.proofStoreUrl).toBe('https://test-proof-store.example');
	});

	it('fetch resolves → status: ready, snapshot populated, subs registered', async () => {
		mocks.getHolderPortfolio.mockResolvedValue(makeSnapshot(HOLDER_A));
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('ready');
		expect(store.snapshot?.holder).toBe(HOLDER_A);
		expect(store.rows.length).toBe(1);
		expect(store.rows[0].balance).toBe(1_500_000n);

		// One row → 2 subs (ATA + ClaimStatus) on a single ws connection.
		expect(mocks.wsConnections.length).toBe(1);
		expect(mocks.wsConnections[0].onAccountChange).toHaveBeenCalledTimes(2);
	});

	it('fetch rejects → status: error, error message set', async () => {
		mocks.getHolderPortfolio.mockRejectedValue(new Error('rpc 502'));
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('error');
		expect(store.error).toBe('rpc 502');
		expect(store.snapshot).toBeNull();
	});

	it('network switch → re-fetch fires, old subs torn down on captured Connection', async () => {
		mocks.getHolderPortfolio.mockResolvedValue(makeSnapshot(HOLDER_A));
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(mocks.wsConnections.length).toBe(1);
		const firstWsConn = mocks.wsConnections[0];

		// Switch network — store should drop snapshot, refetch, and create
		// a fresh ws sub cycle. The previous cycle's listeners must be
		// removed against `firstWsConn` (not a fresh getter call).
		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();
		flushSync();

		// Old cycle listeners removed on the SAME first connection.
		expect(firstWsConn.removeAccountChangeListener).toHaveBeenCalledTimes(2);

		// A second ws connection was created for the new cycle.
		expect(mocks.wsConnections.length).toBe(2);
		expect(mocks.wsConnections[1].onAccountChange).toHaveBeenCalledTimes(2);

		expect(mocks.getHolderPortfolio).toHaveBeenCalledTimes(2);
	});

	it('wallet disconnect → state cleared, subs torn down', async () => {
		mocks.getHolderPortfolio.mockResolvedValue(makeSnapshot(HOLDER_A));
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		const firstWsConn = mocks.wsConnections[0];

		mockWalletState.publicKey = null;
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('idle');
		expect(store.snapshot).toBeNull();
		expect(firstWsConn.removeAccountChangeListener).toHaveBeenCalledTimes(2);
	});

	it('two AccountChange events within debounce window → one re-fetch', async () => {
		mocks.getHolderPortfolio.mockResolvedValue(makeSnapshot(HOLDER_A));
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getHolderPortfolio).toHaveBeenCalledTimes(1);

		// Fire two AccountChange callbacks back-to-back. They were captured
		// in the onAccountChange mock as the second arg.
		const ws = mocks.wsConnections[0];
		const ataCallback = ws.onAccountChange.mock.calls[0][1];
		const claimCallback = ws.onAccountChange.mock.calls[1][1];
		ataCallback();
		claimCallback();

		// Advance past debounce window.
		await vi.advanceTimersByTimeAsync(300);
		await settle();
		flushSync();

		// Initial fetch + one debounced re-fetch = 2 total.
		expect(mocks.getHolderPortfolio).toHaveBeenCalledTimes(2);
	});

	it('late RPC response after wallet switch → ignored', async () => {
		// First fetch resolves slowly (controlled).
		let resolveA: (v: unknown) => void;
		const slowPromise = new Promise((r) => {
			resolveA = r;
		});
		mocks.getHolderPortfolio.mockImplementationOnce(() => slowPromise);
		mocks.getHolderPortfolio.mockResolvedValueOnce(makeSnapshot(HOLDER_B));

		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();

		// Switch wallets BEFORE the first fetch resolves.
		mockWalletState.publicKey = HOLDER_B;
		flushSync();
		await settle();
		flushSync();
		// Second (HOLDER_B) fetch should now have started and may have
		// resolved. Drain everything.
		await settle();
		flushSync();

		// Now resolve the first (stale) call with HOLDER_A's snapshot.
		resolveA!(makeSnapshot(HOLDER_A));
		await settle();
		flushSync();

		// State should reflect HOLDER_B, NOT the stale HOLDER_A snapshot.
		expect(store.snapshot?.holder).toBe(HOLDER_B);
	});

	it('refresh() while pending → returns same Promise', async () => {
		// Use a manual-resolve promise so we can call refresh() while the
		// fetch is in flight.
		let resolve: (v: unknown) => void;
		const promise = new Promise((r) => {
			resolve = r;
		});
		mocks.getHolderPortfolio.mockImplementation(() => promise);

		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		// Drain the effect's microtasks so the first refresh() has fired.
		await settle(2);

		const p1 = store.refresh();
		const p2 = store.refresh();
		expect(p1).toBe(p2);

		resolve!(makeSnapshot(HOLDER_A));
		await Promise.all([p1, p2]);
	});

	it('uses the same Connection instance for onAccountChange and removeAccountChangeListener', async () => {
		mocks.getHolderPortfolio.mockResolvedValue(makeSnapshot(HOLDER_A));
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		// Capture the Connection that received onAccountChange registrations.
		expect(mocks.wsConnections.length).toBe(1);
		const subscribeConn = mocks.wsConnections[0];
		expect(subscribeConn.onAccountChange).toHaveBeenCalledTimes(2);

		// Trigger teardown via wallet disconnect.
		mockWalletState.publicKey = null;
		flushSync();
		await settle();
		flushSync();

		// removeAccountChangeListener MUST land on the same instance.
		expect(subscribeConn.removeAccountChangeListener).toHaveBeenCalledTimes(2);

		// And no NEW ws Connection should have been created for the
		// teardown path (a fresh getter call would have appended).
		expect(mocks.wsConnections.length).toBe(1);
	});
});
