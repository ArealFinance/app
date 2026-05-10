/*
 * Backend-sourced price-feed store — runes-based singleton.
 *
 * Polls `@areal/sdk/markets-rest::getPoolAggregate` every 60s for every pool
 * in the markets snapshot. Surfaces:
 *   - per-pool 24h APY (from the latest daily aggregate row)
 *   - per-pool 24h price-change for token A and token B (derived from the
 *     last two daily rows' captured `priceXUsdc`)
 *
 * `apyForMint(mint)` / `change24hForMint(mint)` resolve a token mint to the
 * highest-TVL pool that contains it (tie-break: lex-asc by poolAddress
 * base58), then return the matching field from the polled row.
 *
 * Public surface:
 *   priceFeed.{rows, status, apyForMint(mint), change24hForMint(mint),
 *              start(), stop(), refresh()}
 *
 * Lifecycle:
 *   - `start()` triggers an initial fetch and arms a 60s interval.
 *     Idempotent.
 *   - `stop()` clears the interval and resets state. Idempotent.
 *
 * Critical correctness invariants:
 *
 *   1. SINGLE-FLIGHT REFRESH at the store level. Concurrent `refresh()`
 *      calls coalesce onto one `pendingRefresh` promise. NOT declared
 *      `async` (an async wrapper returns a fresh Promise per call,
 *      defeating the contract).
 *
 *   2. SINGLE-FLIGHT PER POOL. Within a refresh, each pool is fetched at
 *      most once. If a per-pool fetch is still in flight when a fresh
 *      refresh starts, it's skipped — no double-RPC against the same
 *      backend row.
 *
 *   3. LATE-RESPONSE GUARD via a refresh sequence number. A pool fetch
 *      that resolves after the next refresh started has its result
 *      discarded — we keep what the newer refresh produces.
 *
 *   4. LAST-GOOD WINS on backend failure. `MarketsFetchError` (or any
 *      other throw) sets `status='error'` but DOES NOT clear `rows` —
 *      the UI continues to render the previous APY / 24h-change figures
 *      until the next successful poll lands.
 *
 *   5. NO WS LAYER, NO Connection. This store talks to the backend, not
 *      to RPC, so invariants #1 (Connection identity) and #4 (debounced WS
 *      re-fetch) from the on-chain stores don't apply. The poll interval
 *      is the only refresh trigger besides `markets.snapshot` mutations
 *      observed via `start()`'s effect (Phase 3 page wiring).
 */
import { getPoolAggregate, MarketsFetchError } from '@areal/sdk/markets-rest';
import type { PublicKey } from '@solana/web3.js';
import type { ClusterName } from '@areal/sdk/network';
import { SvelteMap } from 'svelte/reactivity';

import { markets } from '$lib/markets/store.svelte';
import { network } from '$lib/network/network.svelte';
import type { NetworkId } from '$lib/network/endpoints';

export type PriceFeedStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PriceFeedRow {
	/** Pool PDA base58 — primary key. */
	poolAddress: string;
	/** Latest daily APY (1.0 = 100%) — null when backend reports null. */
	apy24h: number | null;
	/** Latest day's captured token-A price in USDC. */
	priceAUsdc: number | null;
	/** Latest day's captured token-B price in USDC. */
	priceBUsdc: number | null;
	/** % change between the latest two days' priceAUsdc. null when window incomplete. */
	change24hA: number | null;
	/** % change between the latest two days' priceBUsdc. null when window incomplete. */
	change24hB: number | null;
}

const POLL_INTERVAL_MS = 60_000;

function toCluster(id: NetworkId): ClusterName {
	return id as ClusterName;
}

let status: PriceFeedStatus = $state('idle');
const rows = new SvelteMap<string, PriceFeedRow>();

// Mutable bookkeeping (not reactive).
let pendingRefresh: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let started = false;
/**
 * Per-refresh sequence number. Each `refresh()` call increments it; per-pool
 * resolutions write through only when their captured sequence matches the
 * current one. Drops stale resolutions after a wallet/network switch
 * triggers a fresh refresh while older fetches are still in flight.
 */
let refreshSeq = 0;
/** poolAddressBase58 → in-flight Promise, used for per-pool single-flight. */
const inFlightByPool = new Map<string, Promise<void>>();

async function fetchOne(poolAddress: string, baseUrl: string, seq: number): Promise<void> {
	try {
		// Pass `baseUrl` instead of `cluster` so the SDK's stale
		// `BACKEND_API_BASE_URLS[cluster]` table (which pins
		// `localnet → http://localhost:3010`) is bypassed. Same fix as
		// holders-store. Without this, the dev server tries to reach the
		// non-existent localhost:3010 and the deployed app would either
		// hit the wrong host or be blocked by CORS.
		const { items } = await getPoolAggregate({ pool: poolAddress, days: 2, baseUrl });

		// Late-response guard. A newer refresh started — drop this result.
		if (seq !== refreshSeq) return;

		const today = items[0];
		const yesterday = items[1];

		const apy24h = today?.apy24h ?? null;
		const priceAUsdc = today?.priceAUsdc ?? null;
		const priceBUsdc = today?.priceBUsdc ?? null;

		const change24hA =
			today && yesterday && today.priceAUsdc != null && yesterday.priceAUsdc
				? (today.priceAUsdc / yesterday.priceAUsdc - 1) * 100
				: null;
		const change24hB =
			today && yesterday && today.priceBUsdc != null && yesterday.priceBUsdc
				? (today.priceBUsdc / yesterday.priceBUsdc - 1) * 100
				: null;

		rows.set(poolAddress, {
			poolAddress,
			apy24h,
			priceAUsdc,
			priceBUsdc,
			change24hA,
			change24hB
		});
	} catch (err) {
		// Late-response guard — silently drop if we're stale.
		if (seq !== refreshSeq) return;
		// Bubble up so doRefresh() can mark the store as error. We keep the
		// previous `rows` entries (last-good wins) — caller decides surface.
		throw err;
	}
}

async function doRefresh(): Promise<void> {
	const seq = ++refreshSeq;

	// Markets snapshot is the source of truth for which pools to poll. If
	// markets isn't ready yet, leave state alone; the next interval tick (or
	// the next markets snapshot mutation) will retry.
	const pools = markets.snapshot?.pools ?? [];
	if (pools.length === 0) {
		// Don't downgrade state on first-load empty case — keep `idle` so
		// the UI shows the right surface.
		return;
	}

	status = status === 'idle' ? 'loading' : status;
	const baseUrl = network.endpoint.backendApiUrl;

	const tasks: Promise<void>[] = [];
	for (const pool of pools) {
		const key = pool.poolAddress.toBase58();
		// Per-pool single-flight: if a previous refresh's fetch for this
		// pool is still pending, reuse it instead of issuing a duplicate.
		const existing = inFlightByPool.get(key);
		if (existing) {
			tasks.push(existing);
			continue;
		}
		const p = fetchOne(key, baseUrl, seq).finally(() => {
			inFlightByPool.delete(key);
		});
		inFlightByPool.set(key, p);
		tasks.push(p);
	}

	const results = await Promise.allSettled(tasks);

	// Late-response guard at the aggregate layer too — a new refresh may
	// have started while we were awaiting allSettled.
	if (seq !== refreshSeq) return;

	const anyFailed = results.some((r) => r.status === 'rejected');
	if (anyFailed) {
		// Last-good wins: keep `rows` populated; flip status so callers can
		// surface a small banner.
		status = 'error';
	} else {
		status = 'ready';
	}
}

/**
 * Public refresh — coalesces concurrent calls onto a single in-flight
 * promise. NOT declared `async` (mirrors the on-chain stores).
 */
function refresh(): Promise<void> {
	if (pendingRefresh) return pendingRefresh;
	pendingRefresh = doRefresh().finally(() => {
		pendingRefresh = null;
	});
	return pendingRefresh;
}

function start(): void {
	if (started) return;
	started = true;
	void refresh();
	pollTimer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
}

function stop(): void {
	if (pollTimer !== null) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	started = false;
	pendingRefresh = null;
	inFlightByPool.clear();
	// Bump the seq so any late in-flight fetches drop their results.
	refreshSeq++;
	rows.clear();
	status = 'idle';
}

/**
 * Find the pool that should source the price/APY for a given mint.
 * Picks highest-TVL pool containing the mint; tie-break ascending by
 * poolAddress base58. Returns `null` when no such pool exists.
 *
 * `tvlUsdc === null` is treated as 0 for ranking — unpriceable pools sort
 * to the bottom but are still considered as a fallback.
 */
function pickPoolForMint(
	mint: PublicKey
): { poolAddress: string; isASide: boolean } | null {
	const mintKey = mint.toBase58();
	const pools = markets.snapshot?.pools ?? [];

	let bestPoolAddr: string | null = null;
	let bestIsASide = false;
	let bestTvl = -1;

	for (const pool of pools) {
		const aKey = pool.tokenAMint.toBase58();
		const bKey = pool.tokenBMint.toBase58();
		const isA = aKey === mintKey;
		const isB = bKey === mintKey;
		if (!isA && !isB) continue;
		const tvl = pool.tvlUsdc ?? 0;
		const addr = pool.poolAddress.toBase58();

		// Strictly greater wins; on tie, prefer lower base58 (ascending lex).
		if (
			tvl > bestTvl ||
			(tvl === bestTvl && bestPoolAddr !== null && addr < bestPoolAddr)
		) {
			bestPoolAddr = addr;
			bestIsASide = isA;
			bestTvl = tvl;
		} else if (bestPoolAddr === null) {
			bestPoolAddr = addr;
			bestIsASide = isA;
			bestTvl = tvl;
		}
	}

	if (bestPoolAddr === null) return null;
	return { poolAddress: bestPoolAddr, isASide: bestIsASide };
}

function apyForMint(mint: PublicKey): number | null {
	const pick = pickPoolForMint(mint);
	if (!pick) return null;
	const row = rows.get(pick.poolAddress);
	return row?.apy24h ?? null;
}

function change24hForMint(mint: PublicKey): number | null {
	const pick = pickPoolForMint(mint);
	if (!pick) return null;
	const row = rows.get(pick.poolAddress);
	if (!row) return null;
	return pick.isASide ? row.change24hA : row.change24hB;
}

export const priceFeed = {
	get rows(): ReadonlyMap<string, PriceFeedRow> {
		return rows;
	},
	get status(): PriceFeedStatus {
		return status;
	},
	apyForMint,
	change24hForMint,
	start,
	stop,
	refresh
};
