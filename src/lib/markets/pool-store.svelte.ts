/*
 * Reactive per-pool store — runes-based singleton for the pool detail modal.
 *
 * Owns:
 *   - The active pool's parsed `PoolState` and the singleton `DexConfig`.
 *   - The computed `DepthResult` for the active pool.
 *   - Per-pool WebSocket subscriptions that recompute depth on reserve changes.
 *
 * Public surface:
 *   poolStore.{pool, depth, isLoading,
 *              activate(poolAddress), deactivate()}
 *
 * Critical correctness invariants (mirrors the swap quote store contract):
 *
 *   1. SAME CONNECTION INSTANCE for `onAccountChange` register and
 *      `removeAccountChangeListener` unregister.
 *
 *   2. ACTIVATE SWITCH tears down the previous cycle on the OLD Connection
 *      before opening a new one. Failure to do so leaks listeners forever.
 *
 *   3. LATE-RESPONSE GUARD. Active pool can change while a `getAccountInfo`
 *      RPC is in flight. We track the active pool key on each fetch and drop
 *      results that don't match.
 *
 *   4. DEBOUNCED RECOMPUTE. WS events from rapid swaps collapse to a single
 *      depth recomputation.
 */
import type { Connection, PublicKey } from '@solana/web3.js';

import {
	parseDexConfig,
	parsePoolState,
	type DexConfig,
	type PoolState
} from '@areal/sdk/native-dex';
import { computeDepth, type DepthResult } from '@areal/sdk/markets';
import { findDexConfigPda } from '@areal/sdk/pda';
import { RWT_MINTS, type ClusterName } from '@areal/sdk/network';

import { network } from '$lib/network/network.svelte';
import type { NetworkId } from '$lib/network/endpoints';

const WS_DEBOUNCE_MS = 250;

function toCluster(id: NetworkId): ClusterName {
	return id as ClusterName;
}

interface SubscriptionCycle {
	wsConn: Connection;
	listenerIds: number[];
}

let pool: PoolState | null = $state(null);
let config: DexConfig | null = $state(null);
let depth: DepthResult | null = $state(null);
let isLoading: boolean = $state(false);

// Bookkeeping — non-reactive.
let activePoolKey: string | null = null;
let activePoolAddress: PublicKey | null = null;
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
	const { wsConn, listenerIds } = cycle;
	for (const id of listenerIds) {
		try {
			wsConn.removeAccountChangeListener(id);
		} catch {
			/* noop */
		}
	}
	cycle = null;
}

/**
 * Recompute depth from the current pool + config. Standard pools only —
 * concentrated pools yield empty bid/ask sides per SDK contract.
 */
function recomputeDepth() {
	if (!pool || !config) {
		depth = null;
		return;
	}
	const cluster = toCluster(network.current);
	const rwtMint = RWT_MINTS[cluster];
	depth = computeDepth({ pool, config, rwtMint, cluster });
}

function scheduleRecompute(reparse?: () => void) {
	clearDebounce();
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		if (reparse) reparse();
		recomputeDepth();
	}, WS_DEBOUNCE_MS);
}

async function fetchAccounts(poolAddress: PublicKey, conn: Connection): Promise<void> {
	const expectedKey = poolAddress.toBase58();
	const programIds = network.endpoint.programIds;
	const [dexConfigPda] = findDexConfigPda(programIds.nativeDex);

	const [poolInfo, configInfo] = await Promise.all([
		conn.getAccountInfo(poolAddress),
		conn.getAccountInfo(dexConfigPda)
	]);

	// Late-response guard — user may have switched pools mid-flight.
	if (activePoolKey !== expectedKey) return;

	if (!poolInfo) {
		pool = null;
		depth = null;
		isLoading = false;
		return;
	}
	pool = parsePoolState(poolInfo.data);

	if (!configInfo) {
		config = null;
		depth = null;
		isLoading = false;
		return;
	}
	config = parseDexConfig(configInfo.data);

	recomputeDepth();
	isLoading = false;
}

function subscribePool(poolAddress: PublicKey) {
	teardownCycle();
	const wsConn = network.wsConnection;
	const programIds = network.endpoint.programIds;
	const [dexConfigPda] = findDexConfigPda(programIds.nativeDex);

	const listenerIds: number[] = [];

	const poolListenerId = wsConn.onAccountChange(poolAddress, (acc) => {
		// Stale-cycle guard.
		if (activePoolKey !== poolAddress.toBase58()) return;
		try {
			const next = parsePoolState(acc.data);
			scheduleRecompute(() => {
				pool = next;
			});
		} catch {
			/* malformed account — drop, leave UI on stale data */
		}
	});
	listenerIds.push(poolListenerId);

	const configListenerId = wsConn.onAccountChange(dexConfigPda, (acc) => {
		if (activePoolKey !== poolAddress.toBase58()) return;
		try {
			const next = parseDexConfig(acc.data);
			scheduleRecompute(() => {
				config = next;
			});
		} catch {
			/* noop */
		}
	});
	listenerIds.push(configListenerId);

	cycle = { wsConn, listenerIds };
}

async function activate(poolAddress: PublicKey): Promise<void> {
	const newKey = poolAddress.toBase58();
	if (activePoolKey === newKey) {
		// No-op — same pool already active.
		return;
	}

	teardownCycle();
	clearDebounce();

	activePoolAddress = poolAddress;
	activePoolKey = newKey;
	pool = null;
	config = null;
	depth = null;
	isLoading = true;

	// Open the WS subscription before the RPC fetch so we don't miss an
	// account change between fetch resolution and listener registration.
	subscribePool(poolAddress);

	await fetchAccounts(poolAddress, network.connection);
}

function deactivate() {
	teardownCycle();
	clearDebounce();
	activePoolAddress = null;
	activePoolKey = null;
	pool = null;
	config = null;
	depth = null;
	isLoading = false;
}

export const poolStore = {
	get pool(): PoolState | null {
		return pool;
	},
	get config(): DexConfig | null {
		return config;
	},
	get depth(): DepthResult | null {
		return depth;
	},
	get isLoading(): boolean {
		return isLoading;
	},
	get activePoolAddress(): PublicKey | null {
		return activePoolAddress;
	},
	activate,
	deactivate
};
