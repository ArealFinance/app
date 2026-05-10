/*
 * Backend-sourced token-holders store — runes-based singleton.
 *
 * Polls `@areal/sdk/markets-rest::getTokenHolders` every 60s for every mint
 * registered via `track()`. Surfaces a per-mint `{count, updatedAt}` row
 * keyed by base58 mint string.
 *
 * Mirrors `prices-store.svelte.ts` line-for-line in structure (single-flight,
 * late-response seq guard, visibilitychange-aware polling). Same correctness
 * invariants apply — see that file's header for the long-form rationale.
 *
 * Public surface:
 *   holdersStore.{rows, status, countForMint(mint), start(), stop(),
 *                 refresh(mint?), track(mint), untrack(mint)}
 *
 * Lifecycle:
 *   - `start()` arms a 60s `setInterval` AND a `visibilitychange` listener
 *     that triggers a refresh when the tab returns to the foreground.
 *     Idempotent.
 *   - `stop()` clears both, drops state, resets status to 'idle'.
 *     Idempotent.
 *
 * Critical correctness invariants:
 *
 *   1. SINGLE-FLIGHT REFRESH at the store level. Concurrent `refresh()`
 *      calls coalesce onto one `pendingRefresh` promise. NOT declared
 *      `async` (an async wrapper returns a fresh Promise per call).
 *
 *   2. SINGLE-FLIGHT PER MINT. Within a refresh, each mint is fetched at
 *      most once. If a per-mint fetch is still in flight when a fresh
 *      refresh starts, it's reused — no double-RPC against the same mint.
 *
 *   3. LATE-RESPONSE GUARD via a refresh sequence number. A mint fetch
 *      that resolves after the next refresh started has its result
 *      discarded — we keep what the newer refresh produces.
 *
 *   4. LAST-GOOD WINS on backend failure. `MarketsFetchError` (or any
 *      other throw) keeps the previous `rows.get(mint)` entry intact. We
 *      flip `status='error'` only when NO row exists yet (so the UI can
 *      surface a banner on a never-loaded mint); when at least one mint
 *      already has a value, we keep `status='ready'` and let the UI keep
 *      showing the last-good count.
 */
import { getTokenHolders, MarketsFetchError } from '@areal/sdk/markets-rest';
import type { PublicKey } from '@solana/web3.js';

import { network } from '$lib/network/network.svelte';

export type HoldersStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface HoldersRow {
	/** Count of SPL token accounts with amount > 0. */
	count: number;
	/** ISO 8601 timestamp at backend's last RPC fetch. */
	updatedAt: string;
}

const POLL_INTERVAL_MS = 60_000;

let status: HoldersStatus = $state('idle');
const tracked = $state(new Set<string>());
const rows = $state(new Map<string, HoldersRow>());

// Mutable bookkeeping (not reactive).
let pendingRefresh: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
/**
 * Per-refresh sequence number. Each `refresh()` call increments it; per-mint
 * resolutions write through only when their captured sequence matches the
 * current one. Drops stale resolutions after a network switch / explicit
 * refresh while older fetches are still in flight.
 */
let refreshSeq = 0;
/** mintBase58 → in-flight Promise, used for per-mint single-flight. */
const inFlightByMint = new Map<string, Promise<void>>();
/**
 * Mints whose `/markets/tokens/<mint>/holders` endpoint returned 404 — backend
 * hasn't shipped that surface for them yet. We skip these on every subsequent
 * refresh and DON'T treat them as a failure (status stays 'ready' / 'idle')
 * so the page UI doesn't flash an error banner for a feature that's just not
 * deployed yet. Cleared on `stop()` so a fresh `start()` re-probes.
 */
const unavailable = new Set<string>();
/** Bound listener reference — stored so `stop()` can detach the same fn. */
let visibilityListener: (() => void) | null = null;

async function fetchOne(mint: string, baseUrl: string, seq: number): Promise<void> {
	try {
		// Pass `baseUrl` instead of `cluster` so the SDK's
		// `BACKEND_API_BASE_URLS[cluster]` lookup is bypassed — that table
		// pins `localnet` to `http://localhost:3010`, the dev backend port,
		// which doesn't exist for users on the deployed app and breaks the
		// dev server too (the absolute URL skips the Vite proxy). Wiring
		// `network.endpoint.backendApiUrl` here matches what we already do
		// for auth / history / markets snapshots — see those files for the
		// matching env-resolution chain.
		const row = await getTokenHolders({ mint, baseUrl });

		// Late-response guard. A newer refresh started — drop this result.
		if (seq !== refreshSeq) return;

		rows.set(mint, {
			count: row.count,
			updatedAt: row.updatedAt
		});
	} catch (err) {
		// Late-response guard — silently drop if we're stale.
		if (seq !== refreshSeq) return;
		// 404 = backend doesn't expose `/markets/tokens/<mint>/holders` for
		// this mint yet (e.g. on the Testnet validator where the indexer
		// hasn't shipped the holders projection). Treat as "feature not
		// available", mark the mint so we stop polling it, and DON'T bubble
		// the error — that would flip `status='error'` and surface an empty
		// banner for a perfectly healthy market that just lacks one optional
		// data point. Last-good wins for any row already populated.
		if (err instanceof MarketsFetchError && err.status === 404) {
			unavailable.add(mint);
			return;
		}
		// Bubble up so doRefresh() can decide whether to flip status. We
		// keep the previous `rows` entry (last-good wins) — caller decides
		// the surface.
		throw err;
	}
}

async function doRefresh(mintFilter?: string): Promise<void> {
	const seq = ++refreshSeq;

	// Resolve which mints to fetch this tick. Single-mint refreshes (called
	// from `track()` or an explicit `refresh(mint)` from the page) bypass
	// the full set so we don't pay a fan-out for what's effectively a
	// targeted top-up. Mints that already 404'd on a previous tick are
	// skipped — that backend surface isn't deployed for them yet.
	const candidates: string[] = mintFilter ? [mintFilter] : Array.from(tracked);
	const mints = candidates.filter((m) => !unavailable.has(m));
	if (mints.length === 0) {
		// Don't downgrade state on first-load empty case — keep 'idle' so
		// the UI shows the right surface.
		return;
	}

	status = status === 'idle' ? 'loading' : status;
	const baseUrl = network.endpoint.backendApiUrl;

	const tasks: Promise<void>[] = [];
	for (const mint of mints) {
		// Per-mint single-flight: if a previous refresh's fetch for this
		// mint is still pending, reuse it instead of issuing a duplicate.
		const existing = inFlightByMint.get(mint);
		if (existing) {
			tasks.push(existing);
			continue;
		}
		const p = fetchOne(mint, baseUrl, seq).finally(() => {
			inFlightByMint.delete(mint);
		});
		inFlightByMint.set(mint, p);
		tasks.push(p);
	}

	const results = await Promise.allSettled(tasks);

	// Late-response guard at the aggregate layer too — a new refresh may
	// have started while we were awaiting allSettled.
	if (seq !== refreshSeq) return;

	const anyFailed = results.some((r) => r.status === 'rejected');
	if (anyFailed) {
		// Last-good wins. If we have at least one row already, keep status
		// 'ready' and let the UI render the cached value. If we have no
		// rows at all (first load failed), flip to 'error' so the UI can
		// surface a banner / placeholder.
		if (rows.size === 0) {
			status = 'error';
		}
		// else: leave status as-is (typically 'ready').
	} else {
		status = 'ready';
	}
}

/**
 * Public refresh — coalesces concurrent calls onto a single in-flight
 * promise. NOT declared `async` (mirrors the on-chain stores).
 *
 * Pass a `mint` to refresh only that mint (skips the full tracked set).
 * Targeted refreshes still respect single-flight: if a full refresh is
 * already in flight, this call reuses it rather than starting a duplicate.
 */
function refresh(mint?: PublicKey): Promise<void> {
	if (pendingRefresh) return pendingRefresh;
	const filter = mint?.toBase58();
	pendingRefresh = doRefresh(filter).finally(() => {
		pendingRefresh = null;
	});
	return pendingRefresh;
}

function onVisible(): void {
	if (typeof document === 'undefined') return;
	if (document.visibilityState === 'visible') {
		void refresh();
	}
}

function start(): void {
	if (started) return;
	started = true;
	void refresh();
	pollTimer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
	if (typeof document !== 'undefined') {
		visibilityListener = onVisible;
		document.addEventListener('visibilitychange', visibilityListener);
	}
}

function stop(): void {
	if (pollTimer !== null) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	if (visibilityListener && typeof document !== 'undefined') {
		document.removeEventListener('visibilitychange', visibilityListener);
	}
	visibilityListener = null;
	started = false;
	pendingRefresh = null;
	inFlightByMint.clear();
	// Bump the seq so any late in-flight fetches drop their results.
	refreshSeq++;
	tracked.clear();
	rows.clear();
	unavailable.clear();
	status = 'idle';
}

function track(mint: PublicKey): void {
	const key = mint.toBase58();
	if (tracked.has(key)) return;
	tracked.add(key);
	// Targeted refresh so the UI doesn't have to wait for the next 60s
	// interval tick to display a count for a freshly-tracked mint.
	void refresh(mint);
}

function untrack(mint: PublicKey): void {
	const key = mint.toBase58();
	tracked.delete(key);
	rows.delete(key);
}

function countForMint(mint: PublicKey): number | null {
	return rows.get(mint.toBase58())?.count ?? null;
}

export const holdersStore = {
	get rows(): ReadonlyMap<string, HoldersRow> {
		return rows;
	},
	get status(): HoldersStatus {
		return status;
	},
	countForMint,
	start,
	stop,
	refresh,
	track,
	untrack
};
