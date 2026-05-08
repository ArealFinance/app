/*
 * Reactive history store — runes-based singleton.
 *
 * Owns the connected wallet's transaction history surface backed by the
 * Areal history backend (Phase 12.2.1). The store mirrors the discipline of
 * `store.svelte.ts`: reactive state via runes, late-response guard against
 * wallet/network races, single-flight on `loadMore`, lifecycle ref-counted
 * so multiple components can mount it without tearing down each other's
 * data.
 *
 * Public surface:
 *   historyStore.{status, items, error, hasMore,
 *                 isLoading, isLoadingMore, kind,
 *                 start(), stop(),
 *                 refresh(), loadMore(), setKind()}
 *
 * Critical correctness invariants:
 *
 *   1. Late-response guard. A wallet/network/filter switch can race with an
 *      in-flight fetch. We track `activeHolder: string` AND
 *      `activeFilterToken: number` and discard any resolution that doesn't
 *      match BOTH. The filter token also covers the common case where a
 *      user toggles two filters in quick succession — the first response
 *      MUST NOT clobber the second filter's results.
 *
 *   2. Single-flight on loadMore. Two concurrent `loadMore()` calls share
 *      one in-flight promise, otherwise we'd double-fetch the same cursor
 *      page and double-append rows.
 *
 *   3. Ref-counted lifecycle. `start()`/`stop()` count refs so two
 *      independent components mounting the store don't fight (the second
 *      `stop()` is a no-op until ref count drops to zero).
 *
 *   4. Disconnect / network switch resets. Holder change OR cluster change
 *      drops items + error and refetches against the new context. The kind
 *      filter survives a network switch (it's a UI preference, not data).
 *
 *   5. baseUrl resolution must produce a non-empty string before we call
 *      the SDK — the SDK throws TypeError on missing baseUrl/cluster, which
 *      surfaces as a generic "TypeError" rather than something the user can
 *      act on. We pre-validate and surface "Unknown cluster" instead.
 */
import { untrack } from 'svelte';

import {
	getTransactions,
	HistoryFetchError,
	type Cursor,
	type HistoryKind,
	type TransactionRow
} from '@areal/sdk/history';
import { HISTORY_API_BASE_URLS } from '@areal/sdk/network';
import { env as publicEnv } from '$env/dynamic/public';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';

export type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface HistoryStore {
	readonly status: HistoryStatus;
	readonly items: TransactionRow[];
	readonly error: string | null;
	readonly hasMore: boolean;
	/** First-page load (status==='loading' && items.length === 0). */
	readonly isLoading: boolean;
	/** Subsequent page load (status==='ready' && a loadMore is in flight). */
	readonly isLoadingMore: boolean;
	readonly kind: HistoryKind | null;
	start(): void;
	stop(): void;
	refresh(): Promise<void>;
	loadMore(): Promise<void>;
	setKind(kind: HistoryKind | null): void;
}

const PAGE_LIMIT = 20;

let status: HistoryStatus = $state('idle');
let items: TransactionRow[] = $state([]);
let error: string | null = $state(null);
let nextCursor: Cursor | null = $state(null);
let isLoadingMore: boolean = $state(false);
let kind: HistoryKind | null = $state(null);

// Mutable bookkeeping (not reactive — never read from $derived).
let activeHolder: string | null = null;
let activeFilterToken: number = 0;
let pendingLoadMore: Promise<void> | null = null;
let stopEffect: (() => void) | null = null;
let refCount: number = 0;

/**
 * Resolve the history backend baseUrl.
 *
 * Order:
 *   1. PUBLIC_HISTORY_API_URL env override (deploy-time tweak)
 *   2. HISTORY_API_BASE_URLS[network.current] from the SDK
 *
 * Returns `null` when neither produces a non-empty string — caller surfaces
 * "Unknown cluster" so the user gets an actionable error instead of a raw
 * SDK TypeError.
 */
let warnedHttpOverride = false;

function resolveBaseUrl(): string | null {
	const override = publicEnv.PUBLIC_HISTORY_API_URL;
	if (override && override.length > 0) {
		// Production deploys must use HTTPS. Warn once if a plain-HTTP override
		// leaked into a prod build (operator misconfig); never warn in dev.
		if (
			!warnedHttpOverride &&
			import.meta.env.PROD &&
			!override.startsWith('https://')
		) {
			warnedHttpOverride = true;
			// eslint-disable-next-line no-console
			console.warn(
				'[history] PUBLIC_HISTORY_API_URL is non-HTTPS in production build:',
				override,
			);
		}
		return override;
	}
	const fromCluster = HISTORY_API_BASE_URLS[network.current];
	if (fromCluster && fromCluster.length > 0) return fromCluster;
	return null;
}

/** Drop everything reactive — used on disconnect / network switch / refresh. */
function resetReactiveState() {
	items = [];
	nextCursor = null;
	error = null;
	isLoadingMore = false;
}

function errorMessage(e: unknown): string {
	if (e instanceof HistoryFetchError) {
		return e.status === null ? `Network error: ${e.message}` : `${e.status}: ${e.message}`;
	}
	if (e instanceof Error) return e.message;
	return String(e);
}

/**
 * Fetch the first page for the current holder + kind. Late results discarded
 * via the (holder, filter token) guard.
 */
async function doFetchFirstPage(): Promise<void> {
	const holder = wallet.publicKey;
	if (!holder) {
		// Caller-protected, but kept for safety. Pure reset.
		status = 'idle';
		resetReactiveState();
		activeHolder = null;
		return;
	}

	const baseUrl = resolveBaseUrl();
	if (baseUrl === null) {
		status = 'error';
		error = 'Unknown cluster';
		items = [];
		nextCursor = null;
		return;
	}

	const holderKey = holder.toBase58();
	const filterToken = ++activeFilterToken;
	// Untrack reads of `kind` so the host effect (which is what triggered us
	// initially) doesn't add `kind` as a dependency through this call chain.
	// `setKind()` drives its own refetch — letting the effect ALSO fire on
	// kind changes would double-fetch.
	const currentKind = untrack(() => kind);
	activeHolder = holderKey;
	status = 'loading';
	error = null;
	items = [];
	nextCursor = null;

	try {
		const page = await getTransactions({
			wallet: holderKey,
			...(currentKind !== null ? { kind: currentKind } : {}),
			limit: PAGE_LIMIT,
			baseUrl
		});

		// Late-response guard. Discard if either holder OR filter changed
		// while we awaited the response.
		if (activeHolder !== holderKey || activeFilterToken !== filterToken) return;

		items = page.items;
		nextCursor = page.nextCursor;
		status = 'ready';
		error = null;
	} catch (e) {
		if (activeHolder !== holderKey || activeFilterToken !== filterToken) return;
		error = errorMessage(e);
		status = 'error';
		items = [];
		nextCursor = null;
	}
}

async function doLoadMore(): Promise<void> {
	const holder = wallet.publicKey;
	if (!holder) return;
	if (nextCursor === null) return;

	const baseUrl = resolveBaseUrl();
	if (baseUrl === null) {
		status = 'error';
		error = 'Unknown cluster';
		return;
	}

	const holderKey = holder.toBase58();
	const filterToken = activeFilterToken;
	const cursorAtCallTime = nextCursor;
	const currentKind = untrack(() => kind);
	isLoadingMore = true;

	try {
		const page = await getTransactions({
			wallet: holderKey,
			...(currentKind !== null ? { kind: currentKind } : {}),
			limit: PAGE_LIMIT,
			before: cursorAtCallTime,
			baseUrl
		});

		// Late-response guard. Filter switched / wallet swapped → drop.
		if (activeHolder !== holderKey || activeFilterToken !== filterToken) return;

		items = [...items, ...page.items];
		nextCursor = page.nextCursor;
	} catch (e) {
		if (activeHolder !== holderKey || activeFilterToken !== filterToken) return;
		error = errorMessage(e);
		status = 'error';
	} finally {
		// Always clear the inflight flag — even for stale responses, since
		// the flag refers to the caller's pending promise.
		isLoadingMore = false;
	}
}

/**
 * Refresh — drops current page and refetches from cursor=null. Idempotent
 * single-flight via the same `pendingLoadMore` slot is intentionally NOT
 * used here: refresh ALWAYS triggers a new fetch (the user clicked Retry,
 * or the effect re-fired on context change).
 */
function refresh(): Promise<void> {
	return doFetchFirstPage();
}

function loadMore(): Promise<void> {
	if (pendingLoadMore) return pendingLoadMore;
	if (nextCursor === null) return Promise.resolve();
	pendingLoadMore = doLoadMore().finally(() => {
		pendingLoadMore = null;
	});
	return pendingLoadMore;
}

function setKind(next: HistoryKind | null): void {
	if (next === kind) return;
	kind = next;
	// Filter change resets the entire list. The effect intentionally does
	// NOT track `kind` (reads are wrapped in `untrack`), so this explicit
	// `void refresh()` is the sole driver of post-setKind refetches —
	// removing it would silently swallow filter changes.
	void refresh();
}

/**
 * React to wallet / network changes. Mirrors the portfolio store's effect
 * pattern: touch reactive sources unconditionally so $effect tracks all
 * branches; reset everything on disconnect; otherwise refetch.
 */
function effectBody() {
	const pk = wallet.publicKey;
	void network.current;
	// NOTE: `kind` is intentionally NOT tracked here. `setKind()` drives its
	// own refetch — letting the effect ALSO fire on kind changes would
	// double-fetch (and on tests with `mockResolvedValueOnce`, eat the
	// queued response on the wrong leg).

	if (!pk) {
		activeHolder = null;
		// New token invalidates any in-flight loadMore that resolves later.
		activeFilterToken++;
		status = 'idle';
		resetReactiveState();
		return;
	}

	void refresh();
}

function start(): void {
	refCount++;
	if (stopEffect !== null) return;
	stopEffect = $effect.root(() => {
		$effect(() => {
			effectBody();
		});
	});
}

function stop(): void {
	if (refCount > 0) refCount--;
	if (refCount > 0) return;
	if (stopEffect) {
		stopEffect();
		stopEffect = null;
	}
	activeHolder = null;
	// Bump the token so any late response from before stop() is discarded.
	activeFilterToken++;
	pendingLoadMore = null;
	status = 'idle';
	// Reset the kind filter — start() should always begin from "All". This
	// also matters in tests where the singleton persists across cases:
	// without this, a test that calls `setKind('swap')` would leak the
	// filter into the next test.
	kind = null;
	resetReactiveState();
}

export const historyStore: HistoryStore = {
	get status(): HistoryStatus {
		return status;
	},
	get items(): TransactionRow[] {
		return items;
	},
	get error(): string | null {
		return error;
	},
	get hasMore(): boolean {
		return nextCursor !== null;
	},
	get isLoading(): boolean {
		return status === 'loading' && items.length === 0;
	},
	get isLoadingMore(): boolean {
		return isLoadingMore;
	},
	get kind(): HistoryKind | null {
		return kind;
	},
	start,
	stop,
	refresh,
	loadMore,
	setKind
};
