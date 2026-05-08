/*
 * History store unit tests.
 *
 * Strategy mirrors `store.test.ts`: mock the SDK + wallet + network
 * singletons. The mock state for wallet/network is backed by reactive
 * `$state()` proxies (re-using `test-helpers.svelte.ts`) so test mutations
 * trigger the store's effect like the real singletons would.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { PublicKey } from '@solana/web3.js';

import type {
	Cursor,
	HistoryKind,
	HistoryPage,
	TransactionRow
} from '@areal/sdk/history';

const HOLDER_A = new PublicKey('11111111111111111111111111111112');
const HOLDER_B = new PublicKey('11111111111111111111111111111113');

const mocks = vi.hoisted(() => ({
	getTransactions: vi.fn()
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_HISTORY_API_URL: 'https://history.example'
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
			}
		}
	};
});

// HistoryFetchError is constructed from the real SDK module so `instanceof`
// checks inside the store work; we only stub the `getTransactions` function.
vi.mock('@areal/sdk/history', async () => {
	const actual = await vi.importActual<typeof import('@areal/sdk/history')>(
		'@areal/sdk/history'
	);
	return {
		...actual,
		getTransactions: mocks.getTransactions
	};
});

vi.mock('@areal/sdk/network', () => ({
	HISTORY_API_BASE_URLS: {
		localnet: 'http://localhost:3010',
		devnet: 'https://history.example',
		mainnet: 'https://history.example'
	}
}));

import { mockWalletState, mockNetworkState, resetMockState } from './test-helpers.svelte';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeRow(id: string, kind: HistoryKind = 'claim'): TransactionRow {
	return {
		id,
		kind,
		wallet: HOLDER_A.toBase58(),
		otMint: null,
		pool: null,
		amountA: '12.5',
		amountB: null,
		sharesDelta: null,
		signature: `SIG_${id}`,
		logIndex: 0,
		blockTime: 1_700_000_000_000
	};
}

function makePage(
	rows: TransactionRow[],
	nextCursor: Cursor | null = null
): HistoryPage<TransactionRow> {
	return { items: rows, nextCursor };
}

async function settle(times = 4) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('history store', () => {
	let store: typeof import('./history.svelte').historyStore;

	beforeEach(async () => {
		resetMockState();
		mocks.getTransactions.mockReset();
		const mod = await import('./history.svelte');
		store = mod.historyStore;
		// Force-stop any residual ref-count from a previous test by calling
		// stop() defensively until the effect tears down. The store keeps
		// internal refCount, so we drain here.
		while (store.status !== 'idle' || store.items.length > 0) {
			store.stop();
			// Defensive: prevent infinite loop if stop() doesn't reset state.
			break;
		}
		store.stop();
	});

	afterEach(() => {
		store?.stop();
	});

	it('start with connected wallet → loads first page', async () => {
		const rows = [makeRow('a'), makeRow('b')];
		mocks.getTransactions.mockResolvedValue(makePage(rows, 'CURSOR_1' as Cursor));

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getTransactions).toHaveBeenCalledTimes(1);
		const args = mocks.getTransactions.mock.calls[0][0];
		expect(args.wallet).toBe(HOLDER_A.toBase58());
		expect(args.baseUrl).toBe('https://history.example');
		expect(args.limit).toBe(20);

		expect(store.status).toBe('ready');
		expect(store.items).toEqual(rows);
		expect(store.hasMore).toBe(true);
		expect(store.error).toBeNull();
	});

	it('loadMore appends + updates hasMore from cursor', async () => {
		const firstRows = [makeRow('a'), makeRow('b')];
		const secondRows = [makeRow('c'), makeRow('d')];
		mocks.getTransactions
			.mockResolvedValueOnce(makePage(firstRows, 'CURSOR_1' as Cursor))
			.mockResolvedValueOnce(makePage(secondRows, null));

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(store.items).toEqual(firstRows);
		expect(store.hasMore).toBe(true);

		await store.loadMore();
		flushSync();

		expect(mocks.getTransactions).toHaveBeenCalledTimes(2);
		const secondArgs = mocks.getTransactions.mock.calls[1][0];
		expect(secondArgs.before).toBe('CURSOR_1');
		expect(store.items).toEqual([...firstRows, ...secondRows]);
		expect(store.hasMore).toBe(false);
	});

	it('setKind resets list + cursor + refetches with kind filter', async () => {
		const initialRows = [makeRow('a', 'claim')];
		const swapRows = [makeRow('s1', 'swap'), makeRow('s2', 'swap')];
		mocks.getTransactions
			.mockResolvedValueOnce(makePage(initialRows, 'CURSOR_INIT' as Cursor))
			.mockResolvedValueOnce(makePage(swapRows, null));

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(store.items).toEqual(initialRows);
		expect(store.kind).toBeNull();

		store.setKind('swap');
		flushSync();
		await settle();
		flushSync();

		// getTransactions was called twice: initial (no kind) + after setKind('swap').
		expect(mocks.getTransactions).toHaveBeenCalledTimes(2);
		const secondArgs = mocks.getTransactions.mock.calls[1][0];
		expect(secondArgs.kind).toBe('swap');
		// loadMore was NOT used → no `before` cursor.
		expect(secondArgs.before).toBeUndefined();

		expect(store.items).toEqual(swapRows);
		expect(store.kind).toBe('swap');
		expect(store.hasMore).toBe(false);
	});

	it('late-response guard: filter switched mid-flight, late response discarded', async () => {
		const claimRows = [makeRow('claim_a', 'claim')];
		const swapRows = [makeRow('swap_a', 'swap')];

		// First call (kind=null at start) hangs.
		let resolveFirst: (v: HistoryPage<TransactionRow>) => void;
		const firstPromise = new Promise<HistoryPage<TransactionRow>>((r) => {
			resolveFirst = r;
		});
		mocks.getTransactions.mockImplementationOnce(() => firstPromise);

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();

		// Switch filter — kicks off a 2nd fetch (returns swapRows immediately).
		mocks.getTransactions.mockResolvedValueOnce(makePage(swapRows, null));
		store.setKind('swap');
		flushSync();
		await settle();
		flushSync();

		// Now resolve the FIRST (stale) call with claim rows. The store must
		// discard them — items should still reflect the swap result.
		resolveFirst!(makePage(claimRows, null));
		await settle();
		flushSync();

		expect(store.items).toEqual(swapRows);
		expect(store.kind).toBe('swap');
	});

	it('single-flight: two parallel loadMore calls dedup to one fetch', async () => {
		mocks.getTransactions.mockResolvedValueOnce(
			makePage([makeRow('a')], 'CURSOR_1' as Cursor)
		);

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		// Set up loadMore response — should fire ONCE despite two callers.
		let resolveLoadMore: (v: HistoryPage<TransactionRow>) => void;
		const loadMorePromise = new Promise<HistoryPage<TransactionRow>>((r) => {
			resolveLoadMore = r;
		});
		mocks.getTransactions.mockImplementationOnce(() => loadMorePromise);

		const p1 = store.loadMore();
		const p2 = store.loadMore();
		expect(p1).toBe(p2);

		resolveLoadMore!(makePage([makeRow('b')], null));
		await Promise.all([p1, p2]);
		flushSync();

		// Initial fetch + one dedup'd loadMore = 2 total.
		expect(mocks.getTransactions).toHaveBeenCalledTimes(2);
		expect(store.items.length).toBe(2);
	});

	it('disconnect resets to idle', async () => {
		mocks.getTransactions.mockResolvedValue(
			makePage([makeRow('a')], 'CURSOR_1' as Cursor)
		);

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('ready');
		expect(store.items.length).toBe(1);

		mockWalletState.publicKey = null;
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('idle');
		expect(store.items).toEqual([]);
		expect(store.error).toBeNull();
		expect(store.hasMore).toBe(false);
	});

	it('error state from HistoryFetchError', async () => {
		const sdk = await import('@areal/sdk/history');
		const err = new sdk.HistoryFetchError('Internal Server Error', 500, '/transactions');
		mocks.getTransactions.mockRejectedValue(err);

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('error');
		expect(store.error).toContain('500');
		expect(store.items).toEqual([]);
		expect(store.hasMore).toBe(false);
	});

	it('empty page: status=ready, items=[], hasMore=false', async () => {
		mocks.getTransactions.mockResolvedValue(makePage([], null));

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(store.status).toBe('ready');
		expect(store.items).toEqual([]);
		expect(store.hasMore).toBe(false);
		expect(store.error).toBeNull();
	});

	it('network switch refetches against new cluster', async () => {
		mocks.getTransactions.mockResolvedValue(makePage([makeRow('a')], null));

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getTransactions).toHaveBeenCalledTimes(1);

		mocks.getTransactions.mockResolvedValueOnce(makePage([makeRow('b')], null));
		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getTransactions).toHaveBeenCalledTimes(2);
	});

	it('wallet switch resets and refetches for new holder', async () => {
		mocks.getTransactions
			.mockResolvedValueOnce(makePage([makeRow('a')], null))
			.mockResolvedValueOnce(makePage([makeRow('b')], null));

		mockWalletState.publicKey = HOLDER_A;
		store.start();
		flushSync();
		await settle();
		flushSync();

		expect(store.items.length).toBe(1);

		mockWalletState.publicKey = HOLDER_B;
		flushSync();
		await settle();
		flushSync();

		expect(mocks.getTransactions).toHaveBeenCalledTimes(2);
		const secondArgs = mocks.getTransactions.mock.calls[1][0];
		expect(secondArgs.wallet).toBe(HOLDER_B.toBase58());
	});
});
