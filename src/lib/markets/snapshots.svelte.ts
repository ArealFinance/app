/*
 * Per-pool snapshots store — runes-based singleton.
 *
 * Owns the time-series surface for the currently active pool on
 * `/markets/[symbol]`. Mirrors the discipline of
 * `portfolio/history.svelte.ts`:
 *
 *   - Late-response guard via (activePoolBase58, fetchToken). Token++ on
 *     `activate`, `setPeriod`, cluster-switch — discards stale resolutions.
 *   - Period-driven fetch strategy:
 *       24H  → getPoolSnapshots (live-merged via realtime ticks).
 *       7D…ALL → getPoolAggregate (daily rollup, capped at 90d server-side;
 *                NOT live-merged — daily buckets are not realtime-meaningful).
 *   - Sliding 24h window for live tick merge: dedup by `blockTime` then trim
 *     anything older than `now - 86400s`.
 *   - Stale → REST poll fallback: when the SDK marks our pool's room stale,
 *     poll `getPoolSnapshots(limit=1)` every 60s until the next live event
 *     clears the stale flag.
 *
 * Q4 (architect): NAV/USD price calc proxy via `tvlUsd / lpSupply`. The
 * REST wire shape does NOT carry per-token USD prices today — escalate to
 * 12.3.4 if true $/token is needed.
 *
 * Public surface:
 *   snapshotsStore.{status, rows, aggregate, error, isStale, period,
 *                    activate(pool), deactivate(), setPeriod(p)}
 */
import { PublicKey } from '@solana/web3.js';

import {
	getPoolSnapshots,
	getPoolAggregate,
	MarketsFetchError,
	type SnapshotRow,
	type DailyAggregateRow
} from '@areal/sdk/markets-rest';
import { env as publicEnv } from '$env/dynamic/public';

import { network } from '$lib/network/network.svelte';
import { realtimeClient } from '$lib/realtime/client.svelte';
import type { RealtimeHandle } from '$lib/realtime/client.svelte';

export type SnapshotsStatus = 'idle' | 'loading' | 'ready' | 'error';
export type Period = '24H' | '7D' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const SNAPSHOT_LIMIT = 200;
const SLIDING_WINDOW_SEC = 86_400; // 24h
const STALE_POLL_INTERVAL_MS = 60_000;

const PERIOD_DAYS: Record<Period, number> = {
	'24H': 1,
	'7D': 7,
	'1M': 30,
	'3M': 90,
	'6M': 180,
	'1Y': 365,
	ALL: 720
};

export interface SnapshotsStore {
	readonly status: SnapshotsStatus;
	readonly rows: SnapshotRow[];
	readonly aggregate: DailyAggregateRow[];
	readonly error: string | null;
	readonly isStale: boolean;
	readonly period: Period;
	activate(pool: PublicKey): void;
	deactivate(): void;
	setPeriod(p: Period): void;
}

let status: SnapshotsStatus = $state('idle');
let rows: SnapshotRow[] = $state([]);
let aggregate: DailyAggregateRow[] = $state([]);
let error: string | null = $state(null);
let period: Period = $state('7D');

// Mutable bookkeeping (NOT reactive).
let activePoolBase58: string | null = null;
let activeFetchToken: number = 0;
let realtimeHandle: RealtimeHandle | null = null;
let realtimeListeners: Array<() => void> = [];
let stalePollTimer: ReturnType<typeof setInterval> | null = null;
let stopEffect: (() => void) | null = null;

let warnedHttpOverride = false;

function resolveBaseUrl(): string | null {
	const override = publicEnv.PUBLIC_MARKETS_API_URL;
	if (override && override.length > 0) {
		if (
			!warnedHttpOverride &&
			import.meta.env.PROD &&
			!override.startsWith('https://')
		) {
			warnedHttpOverride = true;
			// eslint-disable-next-line no-console
			console.warn(
				'[markets-snapshots] PUBLIC_MARKETS_API_URL is non-HTTPS in production build:',
				override
			);
		}
		return override;
	}
	// Resolve via the local NetworkEndpoint instead of the SDK's stale
	// `BACKEND_API_BASE_URLS` map (its `localnet` slot points at
	// `http://localhost:3010`, wrong for our public Testnet build).
	const fromCluster = network.endpoint.backendApiUrl;
	if (fromCluster && fromCluster.length > 0) return fromCluster;
	return null;
}

function nowSec(): number {
	return Math.floor(Date.now() / 1000);
}

function errorMessage(e: unknown): string {
	if (e instanceof MarketsFetchError) {
		return e.status === null ? `Network error: ${e.message}` : `${e.status}: ${e.message}`;
	}
	if (e instanceof Error) return e.message;
	return String(e);
}

/** Trim rows older than the 24h window and return a fresh array. */
function trimSlidingWindow(input: SnapshotRow[]): SnapshotRow[] {
	const cutoff = nowSec() - SLIDING_WINDOW_SEC;
	return input.filter((r) => r.blockTime > cutoff);
}

/**
 * Merge or insert a new tick into the active-pool series, sorted by
 * blockTime ASC. Handles out-of-order ticks (rare under SDK's in-order
 * delivery, but possible if the SDK ever buffers + flushes a batch):
 *   - exact-blockTime match → replace at that index (dedupe)
 *   - tick.blockTime > last → append (fast path, common case)
 *   - tick.blockTime < last → binary-search the insertion point
 */
function mergeTick(tick: SnapshotRow): SnapshotRow[] {
	if (rows.length === 0) return [tick];
	const last = rows[rows.length - 1]!;
	// Fast path: in-order tick → append.
	if (tick.blockTime > last.blockTime) {
		return [...rows, tick];
	}
	// Binary search for the insertion point. `lo` ends up at the smallest
	// index whose `blockTime >= tick.blockTime`.
	let lo = 0;
	let hi = rows.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (rows[mid]!.blockTime < tick.blockTime) lo = mid + 1;
		else hi = mid;
	}
	if (lo < rows.length && rows[lo]!.blockTime === tick.blockTime) {
		// Dedupe: replace the row whose blockTime matches.
		const next = rows.slice();
		next[lo] = tick;
		return next;
	}
	// Insert at `lo`.
	return [...rows.slice(0, lo), tick, ...rows.slice(lo)];
}

function clearStalePoll(): void {
	if (stalePollTimer !== null) {
		clearInterval(stalePollTimer);
		stalePollTimer = null;
	}
}

/** Drop everything reactive — used on activate/deactivate/cluster switch. */
function resetReactiveState(): void {
	rows = [];
	aggregate = [];
	error = null;
}

function detachRealtime(): void {
	for (const off of realtimeListeners) off();
	realtimeListeners = [];
	if (realtimeHandle) {
		realtimeHandle.off();
		realtimeHandle = null;
	}
	clearStalePoll();
}

async function fetchAggregate(poolBase58: string, token: number): Promise<void> {
	const baseUrl = resolveBaseUrl();
	if (baseUrl === null) {
		if (activePoolBase58 !== poolBase58 || activeFetchToken !== token) return;
		status = 'error';
		error = 'Unknown cluster';
		return;
	}
	const days = Math.min(PERIOD_DAYS[period], 90);
	try {
		const page = await getPoolAggregate({ pool: poolBase58, days, baseUrl });
		if (activePoolBase58 !== poolBase58 || activeFetchToken !== token) return;
		aggregate = page.items;
		status = 'ready';
		error = null;
		// Aggregate-mode periods don't carry per-tick rows — clear so the chart
		// can render from `aggregate` instead.
		rows = [];
	} catch (e) {
		if (activePoolBase58 !== poolBase58 || activeFetchToken !== token) return;
		error = errorMessage(e);
		status = 'error';
		rows = [];
		aggregate = [];
	}
}

async function fetchSnapshots(poolBase58: string, token: number): Promise<void> {
	const baseUrl = resolveBaseUrl();
	if (baseUrl === null) {
		if (activePoolBase58 !== poolBase58 || activeFetchToken !== token) return;
		status = 'error';
		error = 'Unknown cluster';
		return;
	}
	try {
		// Fetch BOTH the snapshot series (chart) AND the latest 24h aggregate
		// (volume bar / KPI strip). Aggregate is a small payload; the round-
		// trip is acceptable.
		const [snapPage, aggPage] = await Promise.all([
			getPoolSnapshots({
				pool: poolBase58,
				from: nowSec() - SLIDING_WINDOW_SEC,
				limit: SNAPSHOT_LIMIT,
				baseUrl
			}),
			getPoolAggregate({ pool: poolBase58, days: 1, baseUrl })
		]);
		if (activePoolBase58 !== poolBase58 || activeFetchToken !== token) return;

		// `getPoolSnapshots` returns latest-first; chart wants ASC by blockTime.
		const sorted = [...snapPage.items].sort((a, b) => a.blockTime - b.blockTime);
		rows = trimSlidingWindow(sorted);
		aggregate = aggPage.items;
		status = 'ready';
		error = null;
	} catch (e) {
		if (activePoolBase58 !== poolBase58 || activeFetchToken !== token) return;
		error = errorMessage(e);
		status = 'error';
		rows = [];
		aggregate = [];
	}
}

function dispatchFetch(poolBase58: string, token: number): void {
	if (period === '24H') {
		void fetchSnapshots(poolBase58, token);
	} else {
		void fetchAggregate(poolBase58, token);
	}
}

function attachRealtime(poolBase58: string): void {
	const room = `pool:${poolBase58}` as const;
	realtimeHandle = realtimeClient.useRoom(room);

	// Live tick — only merged when period === '24H'. Other periods render
	// from the daily aggregate, which is not realtime-meaningful at sub-day
	// granularity, so we skip the merge entirely.
	realtimeListeners.push(
		realtimeClient.on('pool_snapshot', (payload) => {
			if (payload.pool !== poolBase58) return;
			if (activePoolBase58 !== poolBase58) return;
			if (period !== '24H') return;
			const tick: SnapshotRow = payload;
			const merged = mergeTick(tick);
			rows = trimSlidingWindow(merged);
		})
	);
}

function startStalePollIfNeeded(poolBase58: string): void {
	if (stalePollTimer !== null) return;
	stalePollTimer = setInterval(() => {
		if (activePoolBase58 !== poolBase58) {
			clearStalePoll();
			return;
		}
		const baseUrl = resolveBaseUrl();
		if (baseUrl === null) return;
		void getPoolSnapshots({ pool: poolBase58, limit: 1, baseUrl })
			.then((page) => {
				// Same-pool guard: if `activate(other)` ran while the request
				// was in flight, drop.
				if (activePoolBase58 !== poolBase58) return;
				if (page.items.length === 0) return;
				const tick = page.items[0]!;
				if (period === '24H') {
					rows = trimSlidingWindow(mergeTick(tick));
				}
			})
			.catch(() => {
				// Silent — stale fallback is best-effort.
			});
	}, STALE_POLL_INTERVAL_MS);
}

/**
 * Track the cluster the active fetch was dispatched against. Reset to
 * `null` when no active pool. Used by the cluster-switch effect to detect
 * a "real" cluster change vs the effect's first-run invocation (which
 * happens immediately after `activate()` already dispatched a fetch).
 */
let dispatchedAgainstCluster: string | null = null;

function ensureEffectRoot(): void {
	if (stopEffect !== null) return;
	stopEffect = $effect.root(() => {
		// Cluster-switch reset: any in-flight fetch is invalidated by the
		// fetch-token bump; we also re-dispatch against the new cluster.
		// Skip the first run after activate (it already dispatched).
		$effect(() => {
			const cluster = network.current;
			if (activePoolBase58 === null) return;
			if (dispatchedAgainstCluster === cluster) return;
			activeFetchToken++;
			status = 'loading';
			resetReactiveState();
			dispatchedAgainstCluster = cluster;
			dispatchFetch(activePoolBase58, activeFetchToken);
		});
		// Stale → REST poll fallback. Watch realtimeClient.staleRooms +
		// activePool.
		$effect(() => {
			const stale = realtimeClient.staleRooms;
			const pool = activePoolBase58;
			if (pool === null) {
				clearStalePoll();
				return;
			}
			const room = `pool:${pool}` as const;
			if (stale.has(room)) {
				startStalePollIfNeeded(pool);
			} else {
				clearStalePoll();
			}
		});
	});
}

function activate(pool: PublicKey): void {
	ensureEffectRoot();
	const poolBase58 = pool.toBase58();
	if (activePoolBase58 === poolBase58) return;

	// Tear down previous subscription (if any).
	detachRealtime();

	activePoolBase58 = poolBase58;
	activeFetchToken++;
	status = 'loading';
	resetReactiveState();
	dispatchedAgainstCluster = network.current;
	attachRealtime(poolBase58);
	dispatchFetch(poolBase58, activeFetchToken);
}

function deactivate(): void {
	detachRealtime();
	activePoolBase58 = null;
	activeFetchToken++;
	status = 'idle';
	resetReactiveState();
	dispatchedAgainstCluster = null;
}

function setPeriod(p: Period): void {
	if (p === period) return;
	period = p;
	if (activePoolBase58 === null) return;
	activeFetchToken++;
	status = 'loading';
	dispatchedAgainstCluster = network.current;
	dispatchFetch(activePoolBase58, activeFetchToken);
}

const isStaleDerived = $derived.by((): boolean => {
	if (activePoolBase58 === null) return false;
	const room = `pool:${activePoolBase58}` as const;
	return realtimeClient.staleRooms.has(room);
});

/** @internal — test-only. Drops singleton state to a clean baseline. */
export function __resetSnapshotsForTests(): void {
	detachRealtime();
	if (stopEffect) {
		stopEffect();
		stopEffect = null;
	}
	activePoolBase58 = null;
	activeFetchToken = 0;
	status = 'idle';
	rows = [];
	aggregate = [];
	error = null;
	period = '7D';
	dispatchedAgainstCluster = null;
}

export const snapshotsStore: SnapshotsStore = {
	get status(): SnapshotsStatus {
		return status;
	},
	get rows(): SnapshotRow[] {
		return rows;
	},
	get aggregate(): DailyAggregateRow[] {
		return aggregate;
	},
	get error(): string | null {
		return error;
	},
	get isStale(): boolean {
		return isStaleDerived;
	},
	get period(): Period {
		return period;
	},
	activate,
	deactivate,
	setPeriod
};
