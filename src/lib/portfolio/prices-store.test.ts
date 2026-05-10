/*
 * Backend price-feed store unit tests.
 *
 * Coverage targets:
 *   - getPoolAggregate called per pool seen in markets.snapshot.pools
 *   - apyForMint picks highest-TVL pool; tie-breaks lex-asc
 *   - change24hForMint derives from priceXUsdc on the chosen side
 *   - 60s polling tick triggers refresh
 *   - MarketsFetchError → status='error', rows retained
 *   - per-pool single-flight
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const POOL_X = new PublicKey('11111111111111111111111111111112');
const POOL_Y = new PublicKey('11111111111111111111111111111113');
const POOL_Z = new PublicKey('11111111111111111111111111111114');
const MINT_A = new PublicKey('11111111111111111111111111111115');
const MINT_B = new PublicKey('11111111111111111111111111111116');
const MINT_C = new PublicKey('11111111111111111111111111111117');
const MINT_USDC = new PublicKey('11111111111111111111111111111118');

const mocks = vi.hoisted(() => ({
	getPoolAggregate: vi.fn(),
	marketsSnapshot: { pools: [] as unknown[] },
	currentNetwork: 'devnet' as 'devnet' | 'mainnet' | 'localnet'
}));

class FakeMarketsFetchError extends Error {
	status: number | null;
	url: string;
	constructor(message: string, status: number | null, url: string) {
		super(message);
		this.status = status;
		this.url = url;
	}
}

vi.mock('@areal/sdk/markets-rest', () => ({
	getPoolAggregate: mocks.getPoolAggregate,
	MarketsFetchError: FakeMarketsFetchError
}));

vi.mock('$lib/markets/store.svelte', () => ({
	markets: {
		get snapshot() {
			return mocks.marketsSnapshot;
		}
	}
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return mocks.currentNetwork;
		}
	}
}));

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

function makePool(
	poolAddress: PublicKey,
	tokenAMint: PublicKey,
	tokenBMint: PublicKey,
	tvlUsdc: number | null
) {
	return { poolAddress, tokenAMint, tokenBMint, tvlUsdc };
}

function makeAggRow(opts: {
	pool: PublicKey;
	day: string;
	apy24h?: number | null;
	priceAUsdc?: number | null;
	priceBUsdc?: number | null;
}) {
	return {
		pool: opts.pool.toBase58(),
		day: opts.day,
		volumeA24h: '0',
		volumeB24h: '0',
		feesA24h: '0',
		feesB24h: '0',
		txCount24h: 0,
		uniqueWallets24h: 0,
		apy24h: opts.apy24h ?? null,
		priceAUsdc: opts.priceAUsdc ?? null,
		priceBUsdc: opts.priceBUsdc ?? null,
		decimalsA: 6,
		decimalsB: 6,
		updatedAt: '2026-01-01T00:00:00Z'
	};
}

async function settle(times = 6) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

// --------------------------------------------------------------------------
// Suite
// --------------------------------------------------------------------------

describe('priceFeed store', () => {
	let priceFeed: typeof import('./prices-store.svelte').priceFeed;

	beforeEach(async () => {
		vi.useFakeTimers();
		mocks.getPoolAggregate.mockReset();
		mocks.marketsSnapshot = { pools: [] };
		mocks.currentNetwork = 'devnet';

		const mod = await import('./prices-store.svelte');
		priceFeed = mod.priceFeed;
		priceFeed.stop();
	});

	afterEach(() => {
		priceFeed?.stop();
		vi.useRealTimers();
	});

	it('start with empty snapshot does not call backend', async () => {
		priceFeed.start();
		await settle();
		expect(mocks.getPoolAggregate).not.toHaveBeenCalled();
		expect(priceFeed.status).toBe('idle');
	});

	it('refresh fetches one row per pool with cluster + days=2', async () => {
		mocks.marketsSnapshot = {
			pools: [
				makePool(POOL_X, MINT_A, MINT_USDC, 1000),
				makePool(POOL_Y, MINT_B, MINT_USDC, 2000)
			]
		};
		mocks.getPoolAggregate.mockImplementation(({ pool }: { pool: string }) => {
			const today = pool === POOL_X.toBase58()
				? makeAggRow({ pool: POOL_X, day: '2026-01-02', apy24h: 0.12, priceAUsdc: 1.1, priceBUsdc: 1.0 })
				: makeAggRow({ pool: POOL_Y, day: '2026-01-02', apy24h: 0.20, priceAUsdc: 2.0, priceBUsdc: 1.0 });
			const yesterday = pool === POOL_X.toBase58()
				? makeAggRow({ pool: POOL_X, day: '2026-01-01', priceAUsdc: 1.0, priceBUsdc: 1.0 })
				: makeAggRow({ pool: POOL_Y, day: '2026-01-01', priceAUsdc: 1.5, priceBUsdc: 1.0 });
			return Promise.resolve({ items: [today, yesterday] });
		});

		await priceFeed.refresh();

		expect(mocks.getPoolAggregate).toHaveBeenCalledTimes(2);
		const callArgs = mocks.getPoolAggregate.mock.calls.map((c) => c[0]);
		for (const args of callArgs) {
			expect(args.days).toBe(2);
			expect(args.cluster).toBe('devnet');
		}
		expect(priceFeed.status).toBe('ready');
		expect(priceFeed.rows.size).toBe(2);
		expect(priceFeed.rows.get(POOL_X.toBase58())?.apy24h).toBe(0.12);
		expect(priceFeed.rows.get(POOL_Y.toBase58())?.apy24h).toBe(0.20);
	});

	it('change24h derives from latest two days (% delta)', async () => {
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 1000)]
		};
		mocks.getPoolAggregate.mockResolvedValue({
			items: [
				makeAggRow({ pool: POOL_X, day: '2026-01-02', apy24h: 0.1, priceAUsdc: 1.1, priceBUsdc: 1.0 }),
				makeAggRow({ pool: POOL_X, day: '2026-01-01', priceAUsdc: 1.0, priceBUsdc: 1.0 })
			]
		});

		await priceFeed.refresh();

		const row = priceFeed.rows.get(POOL_X.toBase58());
		expect(row?.change24hA).toBeCloseTo(10, 5); // (1.1/1.0 - 1)*100
		expect(row?.change24hB).toBeCloseTo(0, 5);
	});

	it('change24h null when only one day available', async () => {
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 1000)]
		};
		mocks.getPoolAggregate.mockResolvedValue({
			items: [makeAggRow({ pool: POOL_X, day: '2026-01-02', apy24h: 0.1, priceAUsdc: 1.1 })]
		});

		await priceFeed.refresh();

		const row = priceFeed.rows.get(POOL_X.toBase58());
		expect(row?.change24hA).toBeNull();
		expect(row?.change24hB).toBeNull();
	});

	it('apyForMint picks highest-TVL pool containing the mint', async () => {
		// MINT_A appears in POOL_X (TVL 100) AND POOL_Y (TVL 500). POOL_Y wins.
		mocks.marketsSnapshot = {
			pools: [
				makePool(POOL_X, MINT_A, MINT_USDC, 100),
				makePool(POOL_Y, MINT_A, MINT_B, 500),
				makePool(POOL_Z, MINT_C, MINT_USDC, 999)
			]
		};
		mocks.getPoolAggregate.mockImplementation(({ pool }: { pool: string }) => {
			const apy =
				pool === POOL_X.toBase58() ? 0.05 : pool === POOL_Y.toBase58() ? 0.50 : 0.99;
			return Promise.resolve({
				items: [makeAggRow({ pool: new PublicKey(pool), day: '2026-01-02', apy24h: apy })]
			});
		});

		await priceFeed.refresh();

		expect(priceFeed.apyForMint(MINT_A)).toBe(0.50);
		expect(priceFeed.apyForMint(MINT_C)).toBe(0.99);
	});

	it('apyForMint tie-break: lower base58 wins on equal TVL', async () => {
		// Two pools containing MINT_A with identical TVL — POOL_X (lower
		// base58) must win the tie-break.
		mocks.marketsSnapshot = {
			pools: [
				makePool(POOL_Y, MINT_A, MINT_USDC, 500),
				makePool(POOL_X, MINT_A, MINT_B, 500)
			]
		};
		mocks.getPoolAggregate.mockImplementation(({ pool }: { pool: string }) => {
			const apy = pool === POOL_X.toBase58() ? 0.111 : 0.222;
			return Promise.resolve({
				items: [makeAggRow({ pool: new PublicKey(pool), day: '2026-01-02', apy24h: apy })]
			});
		});

		await priceFeed.refresh();

		// POOL_X.toBase58() < POOL_Y.toBase58() lex-asc, so POOL_X wins.
		expect(priceFeed.apyForMint(MINT_A)).toBe(0.111);
	});

	it('change24hForMint returns A-side or B-side depending on which side the mint sits', async () => {
		// MINT_A is the A-side of POOL_X. MINT_USDC is the B-side.
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 1000)]
		};
		mocks.getPoolAggregate.mockResolvedValue({
			items: [
				makeAggRow({ pool: POOL_X, day: '2026-01-02', priceAUsdc: 1.2, priceBUsdc: 1.0 }),
				makeAggRow({ pool: POOL_X, day: '2026-01-01', priceAUsdc: 1.0, priceBUsdc: 0.5 })
			]
		});

		await priceFeed.refresh();

		expect(priceFeed.change24hForMint(MINT_A)).toBeCloseTo(20, 5);
		expect(priceFeed.change24hForMint(MINT_USDC)).toBeCloseTo(100, 5); // (1.0/0.5 - 1)*100
	});

	it('apyForMint returns null when no pool contains the mint', async () => {
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 1000)]
		};
		expect(priceFeed.apyForMint(MINT_C)).toBeNull();
	});

	it('60s polling tick triggers refresh', async () => {
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 100)]
		};
		mocks.getPoolAggregate.mockResolvedValue({
			items: [makeAggRow({ pool: POOL_X, day: '2026-01-02', apy24h: 0.1 })]
		});

		priceFeed.start();
		await settle();
		expect(mocks.getPoolAggregate).toHaveBeenCalledTimes(1);

		// Advance to the next 60s tick.
		await vi.advanceTimersByTimeAsync(60_000);
		await settle();
		expect(mocks.getPoolAggregate).toHaveBeenCalledTimes(2);
	});

	it('MarketsFetchError → status=error, rows retained from last good', async () => {
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 100)]
		};

		// First refresh: success.
		mocks.getPoolAggregate.mockResolvedValueOnce({
			items: [makeAggRow({ pool: POOL_X, day: '2026-01-02', apy24h: 0.5 })]
		});
		await priceFeed.refresh();
		expect(priceFeed.status).toBe('ready');
		expect(priceFeed.rows.get(POOL_X.toBase58())?.apy24h).toBe(0.5);

		// Second refresh: backend fails.
		mocks.getPoolAggregate.mockRejectedValueOnce(
			new FakeMarketsFetchError('500', 500, 'http://example/markets/pools/X/aggregate')
		);
		await priceFeed.refresh();

		expect(priceFeed.status).toBe('error');
		// Last-good wins: rows retained.
		expect(priceFeed.rows.get(POOL_X.toBase58())?.apy24h).toBe(0.5);
	});

	it('per-pool single-flight: parallel refreshes do not double-fetch the same pool', async () => {
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 100)]
		};
		let resolve: (v: unknown) => void = () => {};
		const slow = new Promise((r) => {
			resolve = r;
		});
		mocks.getPoolAggregate.mockReturnValue(slow);

		// Two parallel refresh calls — store-level single-flight should
		// coalesce them onto the same in-flight promise.
		const p1 = priceFeed.refresh();
		const p2 = priceFeed.refresh();
		expect(p1).toBe(p2);

		resolve({
			items: [makeAggRow({ pool: POOL_X, day: '2026-01-02', apy24h: 0.1 })]
		});
		await Promise.all([p1, p2]);

		expect(mocks.getPoolAggregate).toHaveBeenCalledTimes(1);
	});

	it('stop() halts polling and clears rows', async () => {
		mocks.marketsSnapshot = {
			pools: [makePool(POOL_X, MINT_A, MINT_USDC, 100)]
		};
		mocks.getPoolAggregate.mockResolvedValue({
			items: [makeAggRow({ pool: POOL_X, day: '2026-01-02', apy24h: 0.1 })]
		});

		priceFeed.start();
		await settle();
		expect(priceFeed.rows.size).toBe(1);

		priceFeed.stop();
		expect(priceFeed.rows.size).toBe(0);
		expect(priceFeed.status).toBe('idle');

		// Advance time — no more fetches should fire after stop.
		const callsBefore = mocks.getPoolAggregate.mock.calls.length;
		await vi.advanceTimersByTimeAsync(120_000);
		await settle();
		expect(mocks.getPoolAggregate.mock.calls.length).toBe(callsBefore);
	});
});
