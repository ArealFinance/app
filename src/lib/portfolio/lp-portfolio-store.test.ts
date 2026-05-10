/*
 * Holder LP-portfolio store unit tests.
 *
 * Mirror of `store.test.ts`. The store under test:
 *   - reads `wallet.publicKey` + `network.current` reactively
 *   - calls `getHolderLpPortfolio` from `@areal/sdk/lp-portfolio`
 *   - registers WS subs on per-row LpPosition AND parent PoolState (deduped)
 *   - exposes a debounced re-fetch + retry surface
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { PublicKey } from '@solana/web3.js';

const HOLDER_A = new PublicKey('11111111111111111111111111111112');
const HOLDER_B = new PublicKey('11111111111111111111111111111113');
const POSITION_1 = new PublicKey('11111111111111111111111111111114');
const POSITION_2 = new PublicKey('11111111111111111111111111111115');
const POSITION_3 = new PublicKey('11111111111111111111111111111116');
const POOL_X = new PublicKey('11111111111111111111111111111117');
const POOL_Y = new PublicKey('11111111111111111111111111111118');
const NEXUS_PDA = new PublicKey('11111111111111111111111111111119');
const TOKEN_A_MINT = new PublicKey('1111111111111111111111111111111A');
const TOKEN_B_MINT = new PublicKey('1111111111111111111111111111111B');
const VAULT_A = new PublicKey('1111111111111111111111111111111C');
const VAULT_B = new PublicKey('1111111111111111111111111111111D');
const OT_TREASURY_DEST = new PublicKey('1111111111111111111111111111111E');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('1111111111111111111111111111111F'),
	yieldDistribution: new PublicKey('1111111111111111111111111111111G'),
	rwtEngine: new PublicKey('1111111111111111111111111111111H'),
	nativeDex: new PublicKey('1111111111111111111111111111111J'),
	futarchy: new PublicKey('1111111111111111111111111111111K')
};

const mocks = vi.hoisted(() => {
	return {
		// Each call to wsConnection getter returns a fresh Connection-like
		// stub. Tests assert the store still uses the same instance for
		// register + remove via the cycle-tracked reference.
		wsConnections: [] as Array<{
			id: number;
			onAccountChange: ReturnType<typeof vi.fn>;
			removeAccountChangeListener: ReturnType<typeof vi.fn>;
		}>,
		readConnection: { _read: true },
		getHolderLpPortfolio: vi.fn(),
		findLiquidityNexusPda: vi.fn()
	};
});

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

vi.mock('@areal/sdk/lp-portfolio', () => ({
	getHolderLpPortfolio: mocks.getHolderLpPortfolio
}));

vi.mock('@areal/sdk/pda', () => ({
	findLiquidityNexusPda: mocks.findLiquidityNexusPda
}));

import { mockWalletState, mockNetworkState, resetMockState } from './test-helpers.svelte';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeRow(positionAddress: PublicKey, poolAddress: PublicKey) {
	return {
		positionAddress,
		position: {
			pool: poolAddress,
			owner: HOLDER_A,
			shares: 1000n,
			lastUpdateTs: 0n,
			bump: 255,
			feesClaimedPerShareA: 0n,
			feesClaimedPerShareB: 0n
		},
		pool: {
			poolType: 0,
			tokenAMint: TOKEN_A_MINT,
			tokenBMint: TOKEN_B_MINT,
			vaultA: VAULT_A,
			vaultB: VAULT_B,
			reserveA: 100n,
			reserveB: 100n,
			totalLpShares: 100n,
			feeBps: 30,
			isActive: true,
			totalFeesAccumulated: 0n,
			binStepBps: 0,
			activeBinId: 0,
			otTreasuryFeeDestination: OT_TREASURY_DEST,
			hasOtTreasury: false,
			bump: 255,
			cumulativeFeesPerShareA: 0n,
			cumulativeFeesPerShareB: 0n
		},
		poolAddress,
		symbolA: 'A',
		symbolB: 'B',
		decimalsA: 6,
		decimalsB: 6,
		valuation: {
			amountA: 100n,
			amountB: 100n,
			usdcA: 100,
			usdcB: 100,
			totalUsdc: 200,
			pctA: 0.5,
			pctB: 0.5,
			ratioA: 0.5
		},
		isEmpty: false
	};
}

function makeSnapshot(holder: PublicKey, rowSpecs: Array<[PublicKey, PublicKey]>) {
	return {
		holder,
		fetchedAt: 1700000000000,
		slot: 100,
		totalUsdc: rowSpecs.length * 200,
		rows: rowSpecs.map(([pos, pool]) => makeRow(pos, pool))
	};
}

function resetMocks() {
	resetMockState();
	mocks.wsConnections.length = 0;
	mocks.getHolderLpPortfolio.mockReset();
	mocks.findLiquidityNexusPda.mockReset();
	mocks.findLiquidityNexusPda.mockReturnValue([NEXUS_PDA, 255]);
}

async function settle(times = 4) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('lp-portfolio store', () => {
	let store: typeof import('./lp-portfolio-store.svelte').lpPortfolio;

	beforeEach(async () => {
		vi.useFakeTimers();
		resetMocks();
		const mod = await import('./lp-portfolio-store.svelte');
		store = mod.lpPortfolio;
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
		expect(mocks.getHolderLpPortfolio).not.toHaveBeenCalled();
	});

	it('disconnected on start → idle, no fetch', () => {
		store.start();
		flushSync();
		expect(store.status).toBe('idle');
		expect(store.snapshot).toBeNull();
		expect(mocks.getHolderLpPortfolio).not.toHaveBeenCalled();
	});

	it('connect → fetch called with holder + program ids + cluster + nexus', async () => {
		mocks.getHolderLpPortfolio.mockResolvedValue(
			makeSnapshot(HOLDER_A, [[POSITION_1, POOL_X]])
		);
		store.start();

		mockWalletState.publicKey = HOLDER_A;
		mockWalletState.isConnected = true;
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getHolderLpPortfolio).toHaveBeenCalledTimes(1);
		const [conn, holder, opts] = mocks.getHolderLpPortfolio.mock.calls[0];
		expect(conn).toBe(mocks.readConnection);
		expect(holder).toBe(HOLDER_A);
		expect(opts.nativeDexProgramId).toBe(PROGRAM_IDS.nativeDex);
		expect(opts.ownershipTokenProgramId).toBe(PROGRAM_IDS.ownershipToken);
		expect(opts.cluster).toBe('devnet');
		expect(opts.liquidityNexus).toBe(NEXUS_PDA);
	});

	it('Invariant 5: subscribes per-position + per-unique-pool (deduped)', async () => {
		// 3 positions: pos1+pos2 share POOL_X, pos3 on POOL_Y → 3 pos subs +
		// 2 pool subs.
		mocks.getHolderLpPortfolio.mockResolvedValue(
			makeSnapshot(HOLDER_A, [
				[POSITION_1, POOL_X],
				[POSITION_2, POOL_X],
				[POSITION_3, POOL_Y]
			])
		);
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('ready');
		expect(store.rows.length).toBe(3);

		// 3 + 2 = 5 listeners on a single ws connection.
		expect(mocks.wsConnections.length).toBe(1);
		expect(mocks.wsConnections[0].onAccountChange).toHaveBeenCalledTimes(5);
	});

	it('fetch rejects → status: error, error message set', async () => {
		mocks.getHolderLpPortfolio.mockRejectedValue(new Error('rpc 502'));
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('error');
		expect(store.error).toBe('rpc 502');
		expect(store.snapshot).toBeNull();
	});

	it('Invariant 1: same Connection instance for register and unregister', async () => {
		mocks.getHolderLpPortfolio.mockResolvedValue(
			makeSnapshot(HOLDER_A, [[POSITION_1, POOL_X]])
		);
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		// Capture the Connection that received onAccountChange registrations.
		expect(mocks.wsConnections.length).toBe(1);
		const subscribeConn = mocks.wsConnections[0];
		// 1 position + 1 pool = 2 listeners.
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

	it('Invariant 2: late RPC after wallet switch → ignored', async () => {
		// First fetch resolves slowly.
		let resolveA: (v: unknown) => void;
		const slowPromise = new Promise((r) => {
			resolveA = r;
		});
		mocks.getHolderLpPortfolio.mockImplementationOnce(() => slowPromise);
		mocks.getHolderLpPortfolio.mockResolvedValueOnce(
			makeSnapshot(HOLDER_B, [[POSITION_2, POOL_Y]])
		);

		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();

		// Switch wallets BEFORE the first fetch resolves.
		mockWalletState.publicKey = HOLDER_B;
		flushSync();
		await settle();
		flushSync();
		await settle();
		flushSync();

		// Now resolve the first (stale) call with HOLDER_A's snapshot.
		resolveA!(makeSnapshot(HOLDER_A, [[POSITION_1, POOL_X]]));
		await settle();
		flushSync();

		// State should reflect HOLDER_B, NOT the stale HOLDER_A snapshot.
		expect(store.snapshot?.holder).toBe(HOLDER_B);
	});

	it('Invariant 3: refresh() while pending → returns same Promise', async () => {
		let resolve: (v: unknown) => void;
		const promise = new Promise((r) => {
			resolve = r;
		});
		mocks.getHolderLpPortfolio.mockImplementation(() => promise);

		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle(2);

		const p1 = store.refresh();
		const p2 = store.refresh();
		expect(p1).toBe(p2);

		resolve!(makeSnapshot(HOLDER_A, [[POSITION_1, POOL_X]]));
		await Promise.all([p1, p2]);
	});

	it('Invariant 4: 5 WS events within debounce → exactly 1 refetch', async () => {
		mocks.getHolderLpPortfolio.mockResolvedValue(
			makeSnapshot(HOLDER_A, [[POSITION_1, POOL_X]])
		);
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getHolderLpPortfolio).toHaveBeenCalledTimes(1);

		const ws = mocks.wsConnections[0];
		// Fire 5 callbacks within 100ms (well under 250ms debounce window).
		for (let i = 0; i < 5; i++) {
			const callback = ws.onAccountChange.mock.calls[i % ws.onAccountChange.mock.calls.length][1];
			callback();
		}

		// Advance past debounce window.
		await vi.advanceTimersByTimeAsync(300);
		await settle();
		flushSync();

		// Initial fetch + one debounced re-fetch = 2 total.
		expect(mocks.getHolderLpPortfolio).toHaveBeenCalledTimes(2);
	});

	it('network switch → re-fetch fires, old subs torn down on captured Connection', async () => {
		mocks.getHolderLpPortfolio.mockResolvedValue(
			makeSnapshot(HOLDER_A, [[POSITION_1, POOL_X]])
		);
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(mocks.wsConnections.length).toBe(1);
		const firstWsConn = mocks.wsConnections[0];

		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();
		flushSync();

		// Old cycle listeners removed on the SAME first connection (1 pos + 1 pool = 2).
		expect(firstWsConn.removeAccountChangeListener).toHaveBeenCalledTimes(2);

		// A second ws connection was created for the new cycle.
		expect(mocks.wsConnections.length).toBe(2);
		expect(mocks.wsConnections[1].onAccountChange).toHaveBeenCalledTimes(2);

		expect(mocks.getHolderLpPortfolio).toHaveBeenCalledTimes(2);
	});

	it('subscription leak check: start → ready → stop tears everything down', async () => {
		mocks.getHolderLpPortfolio.mockResolvedValue(
			makeSnapshot(HOLDER_A, [
				[POSITION_1, POOL_X],
				[POSITION_2, POOL_Y]
			])
		);
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		const ws = mocks.wsConnections[0];
		// 2 positions + 2 pools = 4 listeners.
		expect(ws.onAccountChange).toHaveBeenCalledTimes(4);

		store.stop();

		// All 4 removed on the same Connection.
		expect(ws.removeAccountChangeListener).toHaveBeenCalledTimes(4);
		expect(store.status).toBe('idle');
		expect(store.snapshot).toBeNull();
	});

	it('totalUsdc surfaces snapshot.totalUsdc', async () => {
		mocks.getHolderLpPortfolio.mockResolvedValue(
			makeSnapshot(HOLDER_A, [[POSITION_1, POOL_X]])
		);
		store.start();
		mockWalletState.publicKey = HOLDER_A;
		flushSync();
		await settle();
		flushSync();

		expect(store.totalUsdc).toBe(200);
	});
});
