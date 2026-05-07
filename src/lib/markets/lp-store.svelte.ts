/*
 * Reactive LpPosition store — runes-based singleton for the pool detail
 * modal's "My Position" + Withdraw flows.
 *
 * Owns:
 *   - The active (pool, wallet) tuple's parsed `LpPosition` account.
 *   - A WS subscription on the LpPosition PDA so the modal re-renders
 *     immediately after add/zap/remove transactions land.
 *
 * Public surface:
 *   lpStore.{position, positionAddress, isLoading, hasPosition,
 *            activate(poolAddress, walletAddress), deactivate()}
 *
 * Critical correctness invariants (mirrors `pool-store.svelte.ts`):
 *
 *   1. SAME CONNECTION INSTANCE for `onAccountChange` register and
 *      `removeAccountChangeListener` unregister. `network.wsConnection` is
 *      a getter that returns a fresh Connection per call — captured once
 *      per cycle and stashed on the cycle record.
 *
 *   2. ACTIVATE SWITCH tears down the previous cycle on the OLD Connection
 *      before opening a new one. Dropping this would leak listeners (the
 *      modal opens & closes liberally as the user clicks through pools).
 *
 *   3. LATE-RESPONSE GUARD via the (poolKey, walletKey) tuple. The user
 *      can swap the connected wallet OR pick a different pool while a
 *      `getAccountInfo` is in-flight; we drop results that don't match
 *      the active tuple at resolution time.
 *
 *   4. DEBOUNCED RECOMPUTE. Multiple WS events from one tx (e.g. zap fires
 *      pool + lp_position changes near-simultaneously) collapse to a
 *      single re-fetch.
 *
 *   5. NULL POSITION when LpPosition account does not exist (pre-init
 *      branch — first deposit creates the account inside `add_liquidity`).
 *      Surfaced as `hasPosition === false` so the UI shows "No active
 *      position" rather than "Loading…".
 */
import type { Connection, PublicKey } from '@solana/web3.js';

import { parseLpPosition, type LpPosition } from '@areal/sdk/native-dex';
import { findLpPositionPda } from '@areal/sdk/pda';

import { network } from '$lib/network/network.svelte';

const WS_DEBOUNCE_MS = 250;

interface SubscriptionCycle {
	wsConn: Connection;
	listenerId: number;
}

let position: LpPosition | null = $state(null);
let positionAddress: PublicKey | null = $state(null);
let isLoading: boolean = $state(false);

// Bookkeeping — non-reactive.
let activePoolKey: string | null = null;
let activeWalletKey: string | null = null;
let activeLpPositionPda: PublicKey | null = null;
let cycle: SubscriptionCycle | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearDebounce() {
	if (debounceTimer !== null) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
}

function teardownCycle() {
	clearDebounce();
	if (!cycle) return;
	const { wsConn, listenerId } = cycle;
	try {
		wsConn.removeAccountChangeListener(listenerId);
	} catch {
		/* noop — stale listener id is harmless */
	}
	cycle = null;
}

/**
 * Compose a stable key for the active tuple. Both halves must match for
 * a late RPC response to be applied — switching either pool or wallet
 * invalidates the in-flight fetch.
 */
function tupleKey(poolKey: string, walletKey: string): string {
	return `${poolKey}::${walletKey}`;
}

async function fetchPosition(
	lpPda: PublicKey,
	expectedTuple: string,
	conn: Connection
): Promise<void> {
	let info;
	try {
		info = await conn.getAccountInfo(lpPda);
	} catch {
		// Network error — surface as no position rather than crashing the
		// modal. The WS debounce will retry on the next reserve change.
		if (activeTupleKey() !== expectedTuple) return;
		position = null;
		isLoading = false;
		return;
	}

	// Late-response guard — user may have switched pool or wallet
	// mid-flight.
	if (activeTupleKey() !== expectedTuple) return;

	if (!info) {
		// Account does not exist yet — pre-init branch, treated as zero
		// position. The contract's first `add_liquidity` call creates the
		// PDA from rent.
		position = null;
		isLoading = false;
		return;
	}

	try {
		position = parseLpPosition(info.data);
	} catch {
		// Malformed account — the modal already shows the stale UI on the
		// last known good parse, so leave `position` as-is. Drop the
		// loading flag so the user isn't stuck on a spinner.
	}
	isLoading = false;
}

function activeTupleKey(): string | null {
	if (activePoolKey === null || activeWalletKey === null) return null;
	return tupleKey(activePoolKey, activeWalletKey);
}

function scheduleRecompute() {
	clearDebounce();
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		const expectedTuple = activeTupleKey();
		if (expectedTuple === null || activeLpPositionPda === null) return;
		void fetchPosition(activeLpPositionPda, expectedTuple, network.connection);
	}, WS_DEBOUNCE_MS);
}

function subscribeLpPosition(lpPda: PublicKey, expectedTuple: string) {
	teardownCycle();
	const wsConn = network.wsConnection;

	const listenerId = wsConn.onAccountChange(lpPda, (acc) => {
		// Stale-cycle guard.
		if (activeTupleKey() !== expectedTuple) return;
		// Direct parse + assign rather than re-fetch — the WS payload is
		// authoritative and skips one RPC roundtrip. Wrap in debounce so
		// burst events (zap → pool + lp_position changes near-simultaneously)
		// collapse to a single update.
		clearDebounce();
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			if (activeTupleKey() !== expectedTuple) return;
			try {
				position = parseLpPosition(acc.data);
			} catch {
				/* malformed — keep stale UI */
			}
		}, WS_DEBOUNCE_MS);
	});

	cycle = { wsConn, listenerId };
}

async function activate(
	poolAddress: PublicKey,
	walletAddress: PublicKey
): Promise<void> {
	const newPoolKey = poolAddress.toBase58();
	const newWalletKey = walletAddress.toBase58();
	const newTuple = tupleKey(newPoolKey, newWalletKey);

	// No-op when the tuple is unchanged — saves a redundant RPC + WS sub
	// when the modal re-renders without a pool/wallet swap.
	if (
		activePoolKey === newPoolKey &&
		activeWalletKey === newWalletKey &&
		cycle !== null
	) {
		return;
	}

	teardownCycle();
	clearDebounce();

	const programIds = network.endpoint.programIds;
	const [lpPda] = findLpPositionPda(poolAddress, walletAddress, programIds.nativeDex);

	activePoolKey = newPoolKey;
	activeWalletKey = newWalletKey;
	activeLpPositionPda = lpPda;
	positionAddress = lpPda;
	position = null;
	isLoading = true;

	// Open the WS subscription before the RPC fetch so we don't miss an
	// account change between fetch resolution and listener registration.
	subscribeLpPosition(lpPda, newTuple);

	await fetchPosition(lpPda, newTuple, network.connection);
}

function deactivate() {
	teardownCycle();
	clearDebounce();
	activePoolKey = null;
	activeWalletKey = null;
	activeLpPositionPda = null;
	positionAddress = null;
	position = null;
	isLoading = false;
}

/** Force a fresh fetch of the active LpPosition — used by the LP form FSM. */
async function refresh(): Promise<void> {
	const expectedTuple = activeTupleKey();
	if (expectedTuple === null || activeLpPositionPda === null) return;
	await fetchPosition(activeLpPositionPda, expectedTuple, network.connection);
}

export const lpStore = {
	get position(): LpPosition | null {
		return position;
	},
	get positionAddress(): PublicKey | null {
		return positionAddress;
	},
	get isLoading(): boolean {
		return isLoading;
	},
	get hasPosition(): boolean {
		return position !== null && position.shares > 0n;
	},
	activate,
	deactivate,
	refresh
};
