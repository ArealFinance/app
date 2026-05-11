/*
 * Reactive holder LP-portfolio store — runes-based singleton.
 *
 * Owns the read-only on-chain LP-position list for the connected holder
 * (per-position raw state, USDC valuation, parent pool join) plus the live
 * WebSocket reactivity layer that keeps it fresh.
 *
 * Public surface:
 *   lpPortfolio.{status, snapshot, error, rows, totalUsdc,
 *                isLoading, isReady, hasError,
 *                start(), stop(), refresh()}
 *
 * Lifecycle:
 *   - `start()` is called from the page's `onMount`. Idempotent — re-arming
 *     is a no-op until `stop()` runs.
 *   - `stop()` is called from the page's `onDestroy`. Tears down all WS
 *     subscriptions and disposes the `$effect.root`.
 *   - The internal effect re-fires whenever `wallet.publicKey` or
 *     `network.current` changes, kicking off a fresh fetch + sub cycle.
 *
 * Critical correctness invariants (mirror `portfolio/store.svelte.ts`):
 *
 *   1. SAME CONNECTION INSTANCE for `onAccountChange` register and
 *      `removeAccountChangeListener` unregister. `network.wsConnection` is
 *      a getter that returns a fresh Connection per call — different
 *      instances keep their own listener tables and the listener id is
 *      meaningless to a stranger. We capture `const wsConn =
 *      network.wsConnection;` exactly once per subscription cycle and stash
 *      it on the cycle record.
 *
 *   2. LATE-RESPONSE GUARD. A wallet/network switch can race with an
 *      in-flight RPC fetch. We track `activeHolder` (base58 string) and
 *      drop any resolution where `activeHolder` no longer matches.
 *
 *   3. SINGLE-FLIGHT REFRESH. Concurrent `refresh()` calls coalesce onto
 *      one `pendingRefresh` promise. NOT declared `async` (an async wrapper
 *      would return a fresh Promise per call, defeating the contract).
 *
 *   4. DEBOUNCED WS-TRIGGERED RE-FETCH. A single LP write touches both the
 *      LpPosition AND the parent PoolState near-simultaneously; multi-pool
 *      multi-position holders see N events from one user action. One
 *      composite re-fetch is the correct response, not N.
 *
 *   5. SUBSCRIPTIONS COVER BOTH the per-row LpPosition PDA AND the parent
 *      PoolState PDA. Pool-side listeners are deduped by base58 — many
 *      positions on the same pool share ONE listener. Catches both holder-
 *      initiated updates (LpPosition reserves) and pool-side rebalances
 *      from other actors (PoolState reserves move on every swap, LP
 *      add/zap/remove).
 */
import type { Connection, PublicKey } from '@solana/web3.js';

import {
	getHolderLpPortfolio,
	type HolderLpRow,
	type HolderLpSnapshot
} from '@areal/sdk/lp-portfolio';
import { findLiquidityNexusPda } from '@areal/sdk/pda';
import type { ClusterName } from '@areal/sdk/network';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';
import type { NetworkId } from '$lib/network/endpoints';

export type LpPortfolioStatus = 'idle' | 'loading' | 'ready' | 'error';

const WS_DEBOUNCE_MS = 250;

/**
 * Map our local `NetworkId` to the SDK's `ClusterName`. Names line up 1:1
 * today; routing through the helper keeps a future rename a single-line edit
 * (mirrors `markets/store.svelte.ts`).
 */
function toCluster(id: NetworkId): ClusterName {
	return id as ClusterName;
}

/**
 * One full sub cycle keeps a reference to the Connection it registered on,
 * so we can call `removeAccountChangeListener` on the SAME instance later.
 */
interface SubscriptionCycle {
	wsConn: Connection;
	/** One id per row: LpPosition PDA listeners. */
	positionListenerIds: number[];
	/** poolAddress.toBase58() → listener id. Deduped across rows. */
	poolListenerIds: Map<string, number>;
}

let status: LpPortfolioStatus = $state('idle');
let snapshot: HolderLpSnapshot | null = $state(null);
let error: string | null = $state(null);

// Mutable bookkeeping (not reactive — never read from $derived).
let activeHolder: string | null = null;
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
	const { wsConn, positionListenerIds, poolListenerIds } = cycle;
	for (const id of positionListenerIds) {
		try {
			wsConn.removeAccountChangeListener(id);
		} catch {
			/* noop — stale listener id is harmless */
		}
	}
	for (const id of poolListenerIds.values()) {
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
 * Wire WS subscriptions for every row in `snap`. Captures the Connection
 * instance once so teardown can use the same one. Pool listeners are
 * deduped by base58 — N positions on the same pool share ONE pool listener.
 */
function subscribeRows(snap: HolderLpSnapshot) {
	teardownCycle();

	// Capture the Connection ONCE — the getter would otherwise return a
	// fresh instance on each access and we'd never be able to unsubscribe.
	const wsConn = network.wsConnection;

	const positionListenerIds: number[] = [];
	const poolListenerIds = new Map<string, number>();

	for (const row of snap.rows) {
		const posId = wsConn.onAccountChange(row.positionAddress, () => scheduleRefetch());
		positionListenerIds.push(posId);

		const poolKey = row.poolAddress.toBase58();
		if (!poolListenerIds.has(poolKey)) {
			const poolId = wsConn.onAccountChange(row.poolAddress, () => scheduleRefetch());
			poolListenerIds.set(poolKey, poolId);
		}
	}

	cycle = { wsConn, positionListenerIds, poolListenerIds };
}

/**
 * Run a single fetch + state-transition cycle. Late results (after wallet
 * or network switched) are discarded via the `activeHolder` check.
 */
async function doFetch(): Promise<void> {
	const holder = wallet.publicKey;
	if (!holder) {
		// Nothing to fetch — caller should never reach here, but keep the
		// guard for safety.
		status = 'idle';
		snapshot = null;
		error = null;
		teardownCycle();
		activeHolder = null;
		return;
	}

	const holderKey = holder.toBase58();
	activeHolder = holderKey;
	status = 'loading';
	error = null;

	const conn = network.connection;
	const programIds = network.endpoint.programIds;
	const cluster = toCluster(network.current);
	const [liquidityNexus] = findLiquidityNexusPda(programIds.nativeDex);

	try {
		const snap = await getHolderLpPortfolio(conn, holder, {
			nativeDexProgramId: programIds.nativeDex,
			ownershipTokenProgramId: programIds.ownershipToken,
			cluster,
			liquidityNexus,
			// Testnet (`localnet` cluster) uses its own USDC + RWT mints
			// (bootstrap-init.ts → endpoints.ts overrides), so the SDK's
			// per-cluster defaults would mis-resolve symbols ("F9NV", "3pBt")
			// and price LP positions at 0. network.{usdcMint,rwtMint} returns
			// the override when set, else the canonical SDK mint.
			usdcMint: network.usdcMint,
			rwtMint: network.rwtMint
		});

		// Late-response guard. If the holder changed (wallet switch /
		// disconnect / network switch reset) while we were awaiting RPC,
		// drop this result — the next cycle has authoritative state.
		if (activeHolder !== holderKey) return;

		snapshot = snap;
		status = 'ready';
		error = null;
		subscribeRows(snap);
	} catch (e) {
		if (activeHolder !== holderKey) return;
		const msg = e instanceof Error ? e.message : String(e);
		error = msg;
		status = 'error';
	}
}

/**
 * Public refresh — used by the retry button + WS debounced trigger.
 * Concurrent calls coalesce onto the same in-flight promise.
 *
 * Important: NOT declared `async`. An `async` wrapper would return a fresh
 * Promise on every invocation (because async functions always wrap their
 * return value), defeating the single-flight contract — the test
 * `refresh() === refresh()` would fail even though we returned the same
 * inner promise.
 */
function refresh(): Promise<void> {
	if (pendingRefresh) return pendingRefresh;
	pendingRefresh = doFetch().finally(() => {
		pendingRefresh = null;
	});
	return pendingRefresh;
}

/**
 * React to wallet / network changes.
 *
 * Read both reactive sources at the top so $effect tracks them, then branch
 * on whether the wallet is connected. Disconnect / network-switch resets
 * the snapshot before kicking the next fetch — keeps the UI honest about
 * what cluster the data is from.
 */
function effectBody() {
	// Touch reactive sources unconditionally so $effect tracks ALL paths.
	const pk = wallet.publicKey;
	void network.current;

	if (!pk) {
		teardownCycle();
		activeHolder = null;
		status = 'idle';
		snapshot = null;
		error = null;
		// Force any in-flight refresh promise to be replaced — its result
		// will be discarded by the activeHolder guard anyway.
		pendingRefresh = null;
		return;
	}

	// On any retrigger (network switch, wallet swap), drop the old snapshot
	// immediately so the UI doesn't show wrong-cluster positions.
	teardownCycle();
	snapshot = null;
	// Clear pendingRefresh so that the new holder/network gets its own
	// doFetch cycle. The old pending fetch will still resolve, but its
	// late-response guard (activeHolder check) will discard the result.
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
	activeHolder = null;
	pendingRefresh = null;
	status = 'idle';
	snapshot = null;
	error = null;
}

export const lpPortfolio = {
	get status(): LpPortfolioStatus {
		return status;
	},
	get snapshot(): HolderLpSnapshot | null {
		return snapshot;
	},
	get error(): string | null {
		return error;
	},
	get rows(): HolderLpRow[] {
		return snapshot?.rows ?? [];
	},
	get totalUsdc(): number | null {
		return snapshot?.totalUsdc ?? null;
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
