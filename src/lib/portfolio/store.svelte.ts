/*
 * Reactive portfolio store — runes-based singleton.
 *
 * Owns the read-only on-chain holder portfolio (per-OT balances, distributor
 * existence, claim entitlement) plus the live WebSocket reactivity layer that
 * keeps it fresh.
 *
 * Public surface:
 *   portfolio.{status, snapshot, error, rows,
 *              isLoading, isReady, hasError,
 *              start(), stop(), refresh()}
 *
 * Lifecycle:
 *   - `start()` is called from the page's `onMount`. Idempotent — re-arming
 *     is a no-op until `stop()` runs.
 *   - `stop()` is called from the page's `onDestroy`. Tears down all WS
 *     subscriptions and disposes the `$effect.root`.
 *   - The internal effect re-fires whenever `wallet.publicKey` or
 *     `network.current` changes, kicking off a fresh fetch + sub cycle.
 *
 * Critical correctness invariants (these are the bugs that would silently
 * eat your day):
 *
 *   1. `network.wsConnection` is a getter that returns a *fresh* Connection
 *      per call. `onAccountChange(...)` and `removeAccountChangeListener(id)`
 *      MUST be called on the same Connection instance — different instances
 *      keep their own listener tables and the listener id is meaningless to
 *      a stranger. We capture `const wsConn = network.wsConnection;` exactly
 *      once per subscription cycle and stash it on the cycle record.
 *
 *   2. Late-response guard. A wallet/network switch can race with an
 *      in-flight RPC fetch. We track `activeHolder` (base58 string) and
 *      drop any resolution where `activeHolder` no longer matches.
 *
 *   3. Single-flight refresh. Concurrent `refresh()` calls coalesce onto
 *      one `pendingRefresh` promise — saves wasted RPC and keeps state
 *      transitions monotonic.
 *
 *   4. Debounced WS-triggered re-fetch. Multi-OT batch txs (e.g. claim
 *      across 3 OTs) emit N AccountChange events near-simultaneously; one
 *      composite re-fetch is the correct response, not N.
 *
 *   5. Subscriptions cover BOTH the holder's OT ATA AND the per-OT
 *      ClaimStatus PDA — covers the post-claim update case the SDK already
 *      returns from `claimedAmount`.
 */
import type { Connection, PublicKey } from '@solana/web3.js';

import {
	getHolderPortfolio,
	type PortfolioRow,
	type PortfolioSnapshot
} from '@areal/sdk/portfolio';
import { findClaimStatusPda, findMerkleDistributorPda } from '@areal/sdk/pda';
// `$env/dynamic/public` over `$env/static/public`: dynamic doesn't fail
// `svelte-kit sync` when the variable isn't declared in any `.env` file
// (PUBLIC_PROOF_STORE_URL is optional and may be unset in dev). The
// runtime cost is negligible — one extra property access per fetch.
import { env as publicEnv } from '$env/dynamic/public';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';

export type PortfolioStatus = 'idle' | 'loading' | 'ready' | 'error';

const WS_DEBOUNCE_MS = 250;

/**
 * RWT mint decimals. Hardcoded to match the on-chain RWT mint (see contracts).
 *
 * Phase 7 will lift this into a real source — either by exposing the RWT mint
 * address per network in `endpoints.ts` and reading mint metadata once on
 * portfolio start, or by surfacing it via the SDK's `RwtVault` PDA. Until
 * then, the constant lives here so the magic number isn't sprinkled through
 * the page.
 */
export const RWT_DECIMALS = 6;

/** One row's worth of WS subscriptions, captured against one Connection. */
interface RowSubscription {
	/** ATA listener id, registered against `wsConn`. */
	ataId: number;
	/** ClaimStatus listener id, registered against `wsConn`. */
	claimStatusId: number;
}

/**
 * One full sub cycle keeps a reference to the Connection it registered on,
 * so we can call `removeAccountChangeListener` on the SAME instance later.
 */
interface SubscriptionCycle {
	wsConn: Connection;
	rows: RowSubscription[];
}

let status: PortfolioStatus = $state('idle');
let snapshot: PortfolioSnapshot | null = $state(null);
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
	const { wsConn, rows } = cycle;
	for (const row of rows) {
		// Both calls swallow errors: a stale subscription id is harmless and
		// throwing here would block other rows from being torn down.
		try {
			wsConn.removeAccountChangeListener(row.ataId);
		} catch {
			/* noop */
		}
		try {
			wsConn.removeAccountChangeListener(row.claimStatusId);
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
 * instance once so teardown can use the same one.
 */
function subscribeRows(holder: PublicKey, snap: PortfolioSnapshot) {
	teardownCycle();

	// Capture the Connection ONCE — the getter would otherwise return a
	// fresh instance on each access and we'd never be able to unsubscribe.
	const wsConn = network.wsConnection;
	const yieldDistProgramId = network.endpoint.programIds.yieldDistribution;

	const rows: RowSubscription[] = [];
	for (const row of snap.rows) {
		const [distributorPda] = findMerkleDistributorPda(row.otMint, yieldDistProgramId);
		const [claimStatusPda] = findClaimStatusPda(distributorPda, holder, yieldDistProgramId);

		const ataId = wsConn.onAccountChange(row.ataAddress, () => scheduleRefetch());
		const claimStatusId = wsConn.onAccountChange(claimStatusPda, () =>
			scheduleRefetch()
		);
		rows.push({ ataId, claimStatusId });
	}

	cycle = { wsConn, rows };
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
	// `$env/dynamic/public` returns `string | undefined`; normalise empty
	// string to `undefined` so the SDK takes the no-proofs path instead of
	// issuing requests against `''`.
	const proofStoreUrl = publicEnv.PUBLIC_PROOF_STORE_URL || undefined;

	try {
		const snap = await getHolderPortfolio(conn, holder, {
			ownershipTokenProgramId: programIds.ownershipToken,
			yieldDistributionProgramId: programIds.yieldDistribution,
			proofStoreUrl
		});

		// Late-response guard. If the holder changed (wallet switch /
		// disconnect / network switch reset) while we were awaiting RPC,
		// drop this result — the next cycle has authoritative state.
		if (activeHolder !== holderKey) return;

		snapshot = snap;
		status = 'ready';
		error = null;
		subscribeRows(holder, snap);
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
	// immediately so the UI doesn't show wrong-cluster balances.
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

export const portfolio = {
	get status(): PortfolioStatus {
		return status;
	},
	get snapshot(): PortfolioSnapshot | null {
		return snapshot;
	},
	get error(): string | null {
		return error;
	},
	get rows(): PortfolioRow[] {
		return snapshot?.rows ?? [];
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
