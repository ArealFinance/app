/*
 * Reactive markets store — runes-based singleton.
 *
 * Owns the read-only on-chain markets snapshot (token rows + pool rows +
 * optional RWT vault NAV) plus the live WebSocket reactivity layer that
 * keeps it fresh.
 *
 * Public surface:
 *   markets.{status, snapshot, error, tokens, pools, rwtVault,
 *            isLoading, isReady, hasError,
 *            start(), stop(), refresh()}
 *
 * Lifecycle:
 *   - `start()` is called from the page's `onMount`. Idempotent — re-arming
 *     is a no-op until `stop()` runs.
 *   - `stop()` is called from the page's `onDestroy`. Tears down all WS
 *     subscriptions and disposes the `$effect.root`.
 *   - The internal effect re-fires whenever `network.current` changes,
 *     kicking off a fresh fetch + sub cycle.
 *
 * Critical correctness invariants (mirror the portfolio store contract):
 *
 *   1. SAME CONNECTION INSTANCE for `onAccountChange` register and
 *      `removeAccountChangeListener` unregister. `network.wsConnection` is
 *      a getter that returns a fresh Connection per call — we capture it
 *      once per cycle and stash on the cycle record.
 *
 *   2. LATE-RESPONSE GUARD. A network switch can race with an in-flight
 *      RPC fetch. We track `activeNetwork` (string id) and drop any
 *      resolution where it no longer matches.
 *
 *   3. SINGLE-FLIGHT REFRESH. Concurrent `refresh()` calls coalesce onto
 *      one `pendingRefresh` promise. Refresh is NOT declared `async` so
 *      the same Promise instance is returned to all callers within a
 *      window — `async` would wrap each call in a fresh Promise.
 *
 *   4. DEBOUNCED WS-TRIGGERED RE-FETCH. Pool reserve changes can cascade
 *      via swaps + LP deposits firing N AccountChange events
 *      simultaneously; one composite re-fetch is the correct response.
 *
 *   5. UNBOUNDED FAN-OUT. We subscribe to every pool PDA for snapshot
 *      coverage. Acceptable for Phase 9 (test-validator has 1-2 pools);
 *      revisit on mainnet rollout when the pool count grows.
 */
import type { Connection, PublicKey } from '@solana/web3.js';

import {
	getMarketsSnapshot,
	type MarketsSnapshot,
	type PoolRow,
	type TokenRow
} from '@areal/sdk/markets';
import { findRwtVaultPda, findDexConfigPda } from '@areal/sdk/pda';
import type { ClusterName } from '@areal/sdk/network';

import { network } from '$lib/network/network.svelte';
import type { NetworkId } from '$lib/network/endpoints';
import { isPoolRowMaster } from './master-pool';

export type MarketsStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * `PoolRow` augmented with the cluster-aware master-pool flag the UI uses
 * to disable user-facing add/zap CTAs. We compute this once on snapshot
 * fetch — the mapping is pure (RWT/USDC/USDY mint comparison) and cheap,
 * but doing it inside store.svelte.ts means `isPoolRowMaster` gets the
 * same `cluster` value as the rest of the snapshot.
 */
export interface EnrichedPoolRow extends PoolRow {
	/** `true` when `(tokenAMint, tokenBMint)` matches a protocol master pool. */
	isMaster: boolean;
}

const WS_DEBOUNCE_MS = 250;

/**
 * Map our local `NetworkId` ('mainnet' | 'devnet' | 'localnet') to the SDK's
 * `ClusterName`. The names line up 1:1 today but we route through this
 * helper so a future rename on either side stays a single-line edit.
 */
function toCluster(id: NetworkId): ClusterName {
	return id as ClusterName;
}

/** All listener ids registered for one snapshot cycle, against `wsConn`. */
interface SubscriptionCycle {
	wsConn: Connection;
	listenerIds: number[];
}

let status: MarketsStatus = $state('idle');
let snapshot: MarketsSnapshot | null = $state(null);
let enrichedPools: EnrichedPoolRow[] = $state([]);
let error: string | null = $state(null);

// Mutable bookkeeping (not reactive — never read from $derived).
let activeNetwork: NetworkId | null = null;
let pendingRefresh: Promise<void> | null = null;
let cycle: SubscriptionCycle | null = null;
let wsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let stopEffect: (() => void) | null = null;

function clearDebounce() {
	if (wsDebounceTimer !== null) {
		clearTimeout(wsDebounceTimer);
		wsDebounceTimer = null;
	}
}

/**
 * Tear down the active subscription cycle on the SAME Connection used to
 * register it. Mistakenly calling `network.wsConnection.removeAccount...`
 * here would target a fresh Connection and leak the listeners forever.
 */
function teardownCycle() {
	clearDebounce();
	if (!cycle) return;
	const { wsConn, listenerIds } = cycle;
	for (const id of listenerIds) {
		// Errors are swallowed: a stale subscription id is harmless and
		// throwing would block other listeners from being torn down.
		try {
			wsConn.removeAccountChangeListener(id);
		} catch {
			/* noop */
		}
	}
	cycle = null;
}

/** Schedule a debounced re-fetch in response to a WS event. */
function scheduleRefetch() {
	clearDebounce();
	wsDebounceTimer = setTimeout(() => {
		wsDebounceTimer = null;
		void refresh();
	}, WS_DEBOUNCE_MS);
}

/**
 * Wire WS subscriptions for every pool in `snap` plus the dex config PDA
 * and the rwt vault PDA. Captures the Connection instance once so teardown
 * uses the same one.
 */
function subscribePools(snap: MarketsSnapshot) {
	teardownCycle();

	// Capture the Connection ONCE — getter returns a fresh instance per call.
	const wsConn = network.wsConnection;
	const programIds = network.endpoint.programIds;

	const listenerIds: number[] = [];

	for (const pool of snap.pools) {
		const id = wsConn.onAccountChange(pool.poolAddress, () => scheduleRefetch());
		listenerIds.push(id);
	}

	// Subscribe to the singleton DexConfig (fee bps changes) — one extra
	// listener but it covers the case where global fee parameters change
	// without any pool's reserves moving.
	try {
		const [dexConfigPda] = findDexConfigPda(programIds.nativeDex);
		const id = wsConn.onAccountChange(dexConfigPda, () => scheduleRefetch());
		listenerIds.push(id);
	} catch (err) {
		// PDA derivation failure is non-fatal — pool subs still cover deltas
		// — but it indicates devnet drift in the program-id map, so surface
		// it in DevTools rather than swallowing silently.
		console.warn('[markets store] DexConfig PDA derivation failed:', err);
	}

	// Subscribe to RwtVault when NAV is part of the snapshot — keeps the
	// `Book NAV` UI fresh after `record_nav` calls.
	if (snap.rwtVault) {
		try {
			const [rwtVaultPda] = findRwtVaultPda(programIds.rwtEngine);
			const id = wsConn.onAccountChange(rwtVaultPda, () => scheduleRefetch());
			listenerIds.push(id);
		} catch (err) {
			console.warn('[markets store] RwtVault PDA derivation failed:', err);
		}
	}

	cycle = { wsConn, listenerIds };
}

/**
 * Run a single fetch + state-transition cycle. Late results (after a
 * network switch) are discarded via the `activeNetwork` check.
 */
async function doFetch(): Promise<void> {
	const networkId = network.current;
	activeNetwork = networkId;
	status = 'loading';
	error = null;

	const conn = network.connection;
	const programIds = network.endpoint.programIds;

	try {
		const snap = await getMarketsSnapshot(conn, toCluster(networkId), {
			nativeDexProgramId: programIds.nativeDex,
			ownershipTokenProgramId: programIds.ownershipToken,
			rwtEngineProgramId: programIds.rwtEngine,
			includeNav: true
		});

		// Late-response guard. If the network changed while we were
		// awaiting RPC, drop this result — the next cycle's fetch is
		// authoritative.
		if (activeNetwork !== networkId) return;

		snapshot = snap;
		// Compute master-pool flag here while we hold the active cluster —
		// recomputing on each consumer read would re-derive the same bool
		// per row on every reactive read.
		enrichedPools = snap.pools.map((p) => ({
			...p,
			isMaster: isPoolRowMaster(p, networkId)
		}));
		status = 'ready';
		error = null;
		subscribePools(snap);
	} catch (e) {
		if (activeNetwork !== networkId) return;
		const msg = e instanceof Error ? e.message : String(e);
		error = msg;
		status = 'error';
	}
}

/**
 * Public refresh — used by retry buttons + the WS debounced trigger.
 * Concurrent calls coalesce onto the same in-flight promise.
 *
 * Important: NOT declared `async`. Wrapping in `async` would return a
 * fresh Promise per call (async functions always wrap), defeating the
 * single-flight contract.
 */
function refresh(): Promise<void> {
	if (pendingRefresh) return pendingRefresh;
	pendingRefresh = doFetch().finally(() => {
		pendingRefresh = null;
	});
	return pendingRefresh;
}

/**
 * React to network changes.
 *
 * Read the reactive source up top so $effect tracks it, then drop the
 * stale snapshot and kick a fresh fetch.
 */
function effectBody() {
	// Touch reactive source unconditionally so $effect tracks it.
	void network.current;

	// Drop the old snapshot immediately so the UI doesn't flash
	// wrong-cluster TVL across the switch.
	teardownCycle();
	snapshot = null;
	enrichedPools = [];
	// Invalidate any in-flight refresh — its result will be discarded by
	// the activeNetwork guard, but clearing the slot here lets the next
	// doFetch claim it cleanly.
	pendingRefresh = null;
	void refresh();
}

function start(): void {
	// Idempotent: if an effect root is already live, do nothing.
	if (stopEffect !== null) return;
	stopEffect = $effect.root(() => {
		$effect(() => {
			effectBody();
		});
	});
}

function stop(): void {
	clearDebounce();
	teardownCycle();
	if (stopEffect) {
		stopEffect();
		stopEffect = null;
	}
	activeNetwork = null;
	pendingRefresh = null;
	status = 'idle';
	snapshot = null;
	enrichedPools = [];
	error = null;
}

export const markets = {
	get status(): MarketsStatus {
		return status;
	},
	get snapshot(): MarketsSnapshot | null {
		return snapshot;
	},
	get tokens(): TokenRow[] {
		return snapshot?.tokens ?? [];
	},
	get pools(): EnrichedPoolRow[] {
		return enrichedPools;
	},
	get rwtVault(): { navBookValue: bigint; totalRwtSupply: bigint } | null {
		return snapshot?.rwtVault ?? null;
	},
	get error(): string | null {
		return error;
	},
	get isLoading(): boolean {
		return status === 'loading';
	},
	get isReady(): boolean {
		return status === 'ready';
	},
	get hasError(): boolean {
		return status === 'error';
	},
	start,
	stop,
	refresh
};
