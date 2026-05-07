/*
 * Reactive quote store — runes-based singleton for the swap form.
 *
 * Owns:
 *   - The active pool's parsed `PoolState` and the singleton `DexConfig`.
 *   - Per-pool WebSocket subscriptions that re-quote on reserve changes.
 *   - Debounced re-quote against rapid `setInput` calls (typing).
 *
 * Public surface:
 *   quote.{input, fromMint, toMint, slippageBps, result, pool, config,
 *          setInput(amount, fromMint, toMint), setSlippage(bps),
 *          activatePool(entry), deactivate()}
 *
 * Critical correctness invariants (mirrors the portfolio store contract):
 *
 *   1. SAME CONNECTION INSTANCE for `onAccountChange` register and
 *      `removeAccountChangeListener` unregister. The network store's
 *      `wsConnection` getter returns a *fresh* Connection per access — we
 *      capture it once per cycle and stash it on the cycle record.
 *
 *   2. ACTIVATE-POOL SWITCH tears down the previous cycle on the OLD
 *      Connection before opening a new one. Failure to do so leaks
 *      listeners forever.
 *
 *   3. DEBOUNCED setInput. Multiple rapid keystrokes collapse to one
 *      recompute. Slippage changes do NOT trigger a recompute — only
 *      `minAmountOut` changes (`applySlippage(expectedOut, bps)`).
 *
 *   4. IGNORE STALE FETCHES. Active-pool can change while a `getAccountInfo`
 *      RPC is in flight. We track the active pool key on each fetch and drop
 *      results that don't match.
 */
import type { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

import {
	parseDexConfig,
	parsePoolState,
	quoteSwap,
	type DexConfig,
	type PoolState,
	type QuoteOutcome
} from '@areal/sdk/native-dex';
import { RWT_MINTS } from '@areal/sdk/network';

import { network } from '$lib/network/network.svelte';
import type { PoolEntry } from './pool-catalogue';
import { SLIPPAGE_DEFAULT_BPS, SLIPPAGE_MAX_BPS, SLIPPAGE_MIN_BPS } from './constants';

/** Recompute window after the last `setInput` keystroke. */
const RECOMPUTE_DEBOUNCE_MS = 200;

let input: bigint = $state(0n);
let fromMint: PublicKey | null = $state(null);
let toMint: PublicKey | null = $state(null);
let slippageBps: number = $state(SLIPPAGE_DEFAULT_BPS); // default 0.5%

let pool: PoolState | null = $state(null);
let config: DexConfig | null = $state(null);
let result: QuoteOutcome | null = $state(null);

/** Bookkeeping — non-reactive. */
let activeEntry: PoolEntry | null = null;
let activePoolKey: string | null = null;

interface SubscriptionCycle {
	wsConn: Connection;
	poolListenerId: number;
	configListenerId: number;
}
let cycle: SubscriptionCycle | null = null;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearDebounce() {
	if (debounceTimer !== null) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
}

function teardownCycle() {
	if (!cycle) return;
	const { wsConn, poolListenerId, configListenerId } = cycle;
	try {
		wsConn.removeAccountChangeListener(poolListenerId);
	} catch {
		/* noop */
	}
	try {
		wsConn.removeAccountChangeListener(configListenerId);
	} catch {
		/* noop */
	}
	cycle = null;
}

function recomputeQuote() {
	if (!pool || !config || !fromMint || !toMint) {
		result = null;
		return;
	}
	if (input === 0n) {
		result = null;
		return;
	}

	// Determine `aToB` against the entry's canonical mint order. The pool's
	// stored `tokenAMint` is authoritative.
	const aToB = pool.tokenAMint.equals(fromMint);
	// Sanity: the user's `(from, to)` pair must be the pool's pair.
	if (!aToB && !pool.tokenBMint.equals(fromMint)) {
		result = null;
		return;
	}

	const rwtMint = RWT_MINTS[network.current];
	result = quoteSwap({
		pool,
		config,
		amountIn: input,
		aToB,
		rwtMint
	});
}

function scheduleRecompute() {
	clearDebounce();
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		recomputeQuote();
	}, RECOMPUTE_DEBOUNCE_MS);
}

async function fetchAccounts(entry: PoolEntry, conn: Connection): Promise<void> {
	const expectedKey = entry.poolPda.toBase58();

	const [poolInfo, configInfo] = await Promise.all([
		conn.getAccountInfo(entry.poolPda),
		conn.getAccountInfo(entry.dexConfigPda)
	]);

	// Late-response guard — the user may have switched pools while we were
	// awaiting the RPC.
	if (activePoolKey !== expectedKey) return;

	if (!poolInfo) {
		pool = null;
		result = null;
		return;
	}
	pool = parsePoolState(poolInfo.data);

	if (!configInfo) {
		config = null;
		result = null;
		return;
	}
	config = parseDexConfig(configInfo.data);

	// One immediate recompute against the freshly-loaded reserves — bypass
	// debounce since this is the load-completion edge, not a keystroke.
	recomputeQuote();
}

function subscribePool(entry: PoolEntry) {
	teardownCycle();
	// Capture the Connection ONCE — the getter returns a fresh instance per
	// call and the unsubscribe must target the SAME instance the listener
	// was registered against.
	const wsConn = network.wsConnection;

	const poolListenerId = wsConn.onAccountChange(entry.poolPda, (acc) => {
		// Stale-cycle guard: a cycle teardown can race with a pending
		// notification on the old connection.
		if (activePoolKey !== entry.poolPda.toBase58()) return;
		try {
			pool = parsePoolState(acc.data);
		} catch {
			// Malformed account — drop the result; UI shows stale quote.
			return;
		}
		recomputeQuote();
	});

	const configListenerId = wsConn.onAccountChange(entry.dexConfigPda, (acc) => {
		if (activePoolKey !== entry.poolPda.toBase58()) return;
		try {
			config = parseDexConfig(acc.data);
		} catch {
			return;
		}
		recomputeQuote();
	});

	cycle = { wsConn, poolListenerId, configListenerId };
}

async function activatePool(entry: PoolEntry): Promise<void> {
	const newKey = entry.poolPda.toBase58();
	if (activePoolKey === newKey) {
		// No-op — same pool already active.
		return;
	}

	teardownCycle();
	clearDebounce();

	activeEntry = entry;
	activePoolKey = newKey;
	pool = null;
	config = null;
	result = null;

	// Open the WS subscription before the RPC fetch so we don't miss an
	// account change between fetch resolution and listener registration.
	subscribePool(entry);

	// Fire the read-only RPC fetch on a one-shot Connection.
	await fetchAccounts(entry, network.connection);
}

function deactivate() {
	teardownCycle();
	clearDebounce();
	activeEntry = null;
	activePoolKey = null;
	pool = null;
	config = null;
	result = null;
	input = 0n;
	fromMint = null;
	toMint = null;
}

function setInput(amount: bigint, from: PublicKey, to: PublicKey) {
	input = amount;
	fromMint = from;
	toMint = to;
	scheduleRecompute();
}

function setSlippage(bps: number) {
	if (!Number.isFinite(bps)) return;
	// Clamp to the same window the UI enforces — store is the single source
	// of truth, so the bounds must agree across both layers. See
	// `./constants.ts` for the rationale.
	const clamped = Math.max(SLIPPAGE_MIN_BPS, Math.min(SLIPPAGE_MAX_BPS, Math.round(bps)));
	slippageBps = clamped;
	// Slippage change does NOT recompute the quote — `applySlippage()` runs
	// at the call site against `result.quote.amountOut`. Quote depends only
	// on amountIn + reserves.
}

export const quote = {
	get input(): bigint {
		return input;
	},
	get fromMint(): PublicKey | null {
		return fromMint;
	},
	get toMint(): PublicKey | null {
		return toMint;
	},
	get slippageBps(): number {
		return slippageBps;
	},
	get result(): QuoteOutcome | null {
		return result;
	},
	get pool(): PoolState | null {
		return pool;
	},
	get config(): DexConfig | null {
		return config;
	},
	get activeEntry(): PoolEntry | null {
		return activeEntry;
	},
	setInput,
	setSlippage,
	activatePool,
	deactivate
};
