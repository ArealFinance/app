/*
 * Backend holders-feed store unit tests.
 *
 * Coverage targets:
 *   - track() registers a mint and triggers a refresh that writes count to rows
 *   - countForMint reads back via PublicKey
 *   - single-flight at the store level: concurrent refresh() returns same promise
 *   - MarketsFetchError on a subsequent refresh keeps last-good count
 *   - untrack() removes mint from polling set and rows
 *   - stop() clears state, resets status to 'idle', halts polling
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const MINT_A = new PublicKey('11111111111111111111111111111112');
const MINT_B = new PublicKey('11111111111111111111111111111113');

const mocks = vi.hoisted(() => ({
	getTokenHolders: vi.fn(),
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
	getTokenHolders: mocks.getTokenHolders,
	MarketsFetchError: FakeMarketsFetchError
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

function makeRow(mint: PublicKey, count: number, source: 'rpc' | 'cache' = 'rpc') {
	return {
		mint: mint.toBase58(),
		count,
		updatedAt: '2026-01-02T00:00:00Z',
		source
	};
}

async function settle(times = 20) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

// --------------------------------------------------------------------------
// Suite
// --------------------------------------------------------------------------

describe('holdersStore', () => {
	let holdersStore: typeof import('./holders-store.svelte').holdersStore;

	beforeEach(async () => {
		vi.useFakeTimers();
		mocks.getTokenHolders.mockReset();
		mocks.currentNetwork = 'devnet';

		const mod = await import('./holders-store.svelte');
		holdersStore = mod.holdersStore;
		holdersStore.stop();
	});

	afterEach(() => {
		holdersStore?.stop();
		vi.useRealTimers();
	});

	it('track() + refresh writes the backend count into rows', async () => {
		mocks.getTokenHolders.mockResolvedValue(makeRow(MINT_A, 1234));

		holdersStore.track(MINT_A);
		// `refresh()` here joins the in-flight promise spawned by track().
		await holdersStore.refresh();

		expect(mocks.getTokenHolders).toHaveBeenCalledTimes(1);
		const args = mocks.getTokenHolders.mock.calls[0]![0];
		expect(args.mint).toBe(MINT_A.toBase58());
		expect(args.cluster).toBe('devnet');

		expect(holdersStore.countForMint(MINT_A)).toBe(1234);
		expect(holdersStore.status).toBe('ready');
	});

	it('countForMint returns null for unknown mint', () => {
		expect(holdersStore.countForMint(MINT_B)).toBeNull();
	});

	it('single-flight: parallel refresh() calls return the same promise', async () => {
		// First seed a tracked mint with a known-good initial fetch.
		mocks.getTokenHolders.mockResolvedValueOnce(makeRow(MINT_A, 1));
		holdersStore.track(MINT_A);
		await holdersStore.refresh();

		let resolve: (v: unknown) => void = () => {};
		const slow = new Promise((r) => {
			resolve = r;
		});
		mocks.getTokenHolders.mockReturnValue(slow);

		const p1 = holdersStore.refresh();
		const p2 = holdersStore.refresh();
		expect(p1).toBe(p2);

		resolve(makeRow(MINT_A, 99));
		await Promise.all([p1, p2]);

		// One call from `track()`, plus exactly one from the coalesced pair.
		expect(mocks.getTokenHolders).toHaveBeenCalledTimes(2);
	});

	it('MarketsFetchError on a follow-up refresh keeps last-good count', async () => {
		// First refresh: success.
		mocks.getTokenHolders.mockResolvedValueOnce(makeRow(MINT_A, 500));
		holdersStore.track(MINT_A);
		await holdersStore.refresh();
		expect(holdersStore.countForMint(MINT_A)).toBe(500);
		expect(holdersStore.status).toBe('ready');

		// Second refresh: backend fails.
		mocks.getTokenHolders.mockRejectedValueOnce(
			new FakeMarketsFetchError('500', 500, 'http://example/markets/tokens/X/holders')
		);
		await holdersStore.refresh();

		// Last-good wins: count retained, status still 'ready' (we have a row).
		expect(holdersStore.countForMint(MINT_A)).toBe(500);
		expect(holdersStore.status).toBe('ready');
	});

	it('first-load failure with no rows flips status to error', async () => {
		mocks.getTokenHolders.mockRejectedValue(
			new FakeMarketsFetchError('503', 503, 'http://example/markets/tokens/X/holders')
		);
		holdersStore.track(MINT_A);
		await holdersStore.refresh();

		expect(holdersStore.countForMint(MINT_A)).toBeNull();
		expect(holdersStore.status).toBe('error');
	});

	it('untrack removes mint from polling set + rows', async () => {
		mocks.getTokenHolders.mockResolvedValue(makeRow(MINT_A, 7));
		holdersStore.track(MINT_A);
		await holdersStore.refresh();
		expect(holdersStore.countForMint(MINT_A)).toBe(7);

		holdersStore.untrack(MINT_A);
		expect(holdersStore.countForMint(MINT_A)).toBeNull();

		// A subsequent full refresh must not re-fetch the untracked mint.
		const callsBefore = mocks.getTokenHolders.mock.calls.length;
		await holdersStore.refresh();
		expect(mocks.getTokenHolders.mock.calls.length).toBe(callsBefore);
	});

	it('stop() clears state, resets status to idle, halts polling', async () => {
		mocks.getTokenHolders.mockResolvedValue(makeRow(MINT_A, 42));
		holdersStore.track(MINT_A);
		holdersStore.start();
		await holdersStore.refresh();
		expect(holdersStore.rows.size).toBe(1);

		holdersStore.stop();
		expect(holdersStore.rows.size).toBe(0);
		expect(holdersStore.status).toBe('idle');
		expect(holdersStore.countForMint(MINT_A)).toBeNull();

		// Advance time — no more fetches should fire after stop().
		const callsBefore = mocks.getTokenHolders.mock.calls.length;
		await vi.advanceTimersByTimeAsync(120_000);
		await settle();
		expect(mocks.getTokenHolders.mock.calls.length).toBe(callsBefore);
	});

	it('60s polling tick triggers refresh', async () => {
		mocks.getTokenHolders.mockResolvedValue(makeRow(MINT_A, 10));
		holdersStore.track(MINT_A);
		holdersStore.start();
		await holdersStore.refresh();

		const callsBefore = mocks.getTokenHolders.mock.calls.length;

		await vi.advanceTimersByTimeAsync(60_000);
		await settle();

		expect(mocks.getTokenHolders.mock.calls.length).toBeGreaterThan(callsBefore);
	});
});
