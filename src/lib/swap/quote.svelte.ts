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
 * Re-exports `QuoteOutcome` transparently; `result.quote.userTotalDebit`
 * carries the docs-compliant "wallet debit" for balance preflight (sell-RWT
 * adds fees on top of `amountIn`; buy-RWT equals `amountIn`).
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
	parseBinArray,
	parseDexConfig,
	parsePoolState,
	quoteSwap,
	type DexConfig,
	type MasterPoolQuoteContext,
	type PoolState,
	type QuoteOutcome
} from '@areal/sdk/native-dex';
import { parseRwtVault } from '@areal/sdk/rwt-engine';
import { findBinArrayPda, findRwtVaultPda } from '@areal/sdk/pda';

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

/**
 * CP-11 — caller-side master-pool quote context, populated on master-pool
 * activation only. Holds the latest `(nav, hasOrganicAsk)` reads needed by
 * the SDK quote engine to decide between bin-walk and mint-route. `null`
 * for non-master pools — `recomputeQuote` skips passing the context in
 * that case and the SDK falls back to the bin-walk branch.
 */
let masterPoolContext: MasterPoolQuoteContext | null = $state(null);

/** Bookkeeping — non-reactive. */
let activeEntry: PoolEntry | null = null;
let activePoolKey: string | null = null;

interface SubscriptionCycle {
	wsConn: Connection;
	poolListenerId: number;
	configListenerId: number;
	/** Optional — wired only on master-pool cycles (RwtVault NAV + BinArray). */
	rwtVaultListenerId?: number;
	binArrayListenerId?: number;
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
	const { wsConn, poolListenerId, configListenerId, rwtVaultListenerId, binArrayListenerId } =
		cycle;
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
	if (rwtVaultListenerId !== undefined) {
		try {
			wsConn.removeAccountChangeListener(rwtVaultListenerId);
		} catch {
			/* noop */
		}
	}
	if (binArrayListenerId !== undefined) {
		try {
			wsConn.removeAccountChangeListener(binArrayListenerId);
		} catch {
			/* noop */
		}
	}
	cycle = null;
}

/**
 * CP-11 — scan a parsed BinArray for any non-zero `liquidity_a` strictly
 * above the pool's active bin. Mirrors the on-chain
 * `is_organic_ask_present` predicate used by the mint-route gate.
 *
 * `liquidity_a` is the per-bin RWT inventory (sell-side of the ladder) —
 * when every bin above `activeBinId` is empty there is no organic ask for
 * a USDC→RWT swap to consume, and the contract reroutes through
 * `rwt_engine::mint_rwt`.
 */
function hasOrganicAskAbove(bins: { liquidityA: bigint }[], lowerBinId: number, activeBinId: number): boolean {
	// Bins are stored as a fixed-length array; index 0 corresponds to
	// `lowerBinId`. We want any bin with `binId > activeBinId` to have
	// non-zero liquidity_a.
	for (let i = 0; i < bins.length; i++) {
		const binId = lowerBinId + i;
		if (binId <= activeBinId) continue;
		if (bins[i]!.liquidityA > 0n) return true;
	}
	return false;
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

	const rwtMint = network.rwtMint;
	// CP-11 — pass the master-pool context only when the active pool is a
	// master pool AND the context fetch completed. For non-master pools the
	// SDK quote engine ignores the field and stays on the bin-walk path. For
	// master pools without context yet (RPC fetch pending or failed) we omit
	// the field, which collapses to the legacy "EmptyReserves" refuse — UI
	// gates the swap CTA off `quoteError !== null` so users see "Pool
	// unavailable" until the context lands.
	result = quoteSwap({
		pool,
		config,
		amountIn: input,
		aToB,
		rwtMint,
		...(masterPoolContext ? { masterPoolContext } : {})
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

	// CP-11 — master-pool branch. Fetch RwtVault (for NAV) and BinArray
	// (for organic-ask detection) so the SDK can decide between bin-walk
	// and mint-route. Both reads are fail-open: a missing account collapses
	// to "no context" and the quote engine falls back to bin-walk (which
	// returns `EmptyReserves` for concentrated pools).
	if (entry.isMasterPool) {
		await refreshMasterPoolContext(entry, conn);
		if (activePoolKey !== expectedKey) return;
	} else {
		masterPoolContext = null;
	}

	// One immediate recompute against the freshly-loaded reserves — bypass
	// debounce since this is the load-completion edge, not a keystroke.
	recomputeQuote();
}

/**
 * CP-11 — refresh the `masterPoolContext` (NAV + hasOrganicAsk) for a
 * master pool. Pure read-only RPC; called on activation and from the
 * RwtVault / BinArray WS listeners.
 *
 * Fail-open semantics: any RPC failure or parse error leaves the previous
 * context in place (or `null` if this is the first attempt). The quote
 * engine treats `null` as "no master-pool context known" and refuses to
 * price the concentrated pool, which surfaces in the UI as
 * "Pool unavailable" until the data lands.
 */
async function refreshMasterPoolContext(entry: PoolEntry, conn: Connection): Promise<void> {
	const expectedKey = entry.poolPda.toBase58();
	const programIds = network.endpoint.programIds;

	let rwtVaultPda: PublicKey;
	let binArrayPda: PublicKey;
	try {
		[rwtVaultPda] = findRwtVaultPda(programIds.rwtEngine);
		[binArrayPda] = findBinArrayPda(entry.poolPda, programIds.nativeDex);
	} catch (err) {
		console.warn('[quote store] PDA derivation failed for master pool:', err);
		return;
	}

	try {
		const [vaultInfo, binInfo] = await Promise.all([
			conn.getAccountInfo(rwtVaultPda),
			conn.getAccountInfo(binArrayPda)
		]);
		if (activePoolKey !== expectedKey) return;
		if (!vaultInfo || !binInfo) return;
		const vault = parseRwtVault(vaultInfo.data);
		const bins = parseBinArray(binInfo.data);
		masterPoolContext = {
			nav: vault.navBookValue,
			hasOrganicAsk: hasOrganicAskAbove(bins.bins, bins.lowerBinId, bins.activeBinId)
		};
	} catch (err) {
		console.warn('[quote store] master-pool context fetch failed:', err);
		// Leave existing context in place — better stale than blanking
		// out an in-flight quote.
	}
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

	let rwtVaultListenerId: number | undefined;
	let binArrayListenerId: number | undefined;

	// CP-11 — master-pool branch: keep the mint-route decision live as NAV
	// or bin-array liquidity moves. Same WS-as-cycle pattern as the pool/
	// config subs above; teardownCycle removes both.
	if (entry.isMasterPool) {
		const programIds = network.endpoint.programIds;
		try {
			const [rwtVaultPda] = findRwtVaultPda(programIds.rwtEngine);
			rwtVaultListenerId = wsConn.onAccountChange(rwtVaultPda, (acc) => {
				if (activePoolKey !== entry.poolPda.toBase58()) return;
				try {
					const vault = parseRwtVault(acc.data);
					if (masterPoolContext) {
						masterPoolContext = {
							...masterPoolContext,
							nav: vault.navBookValue
						};
					} else {
						masterPoolContext = {
							nav: vault.navBookValue,
							hasOrganicAsk: false
						};
					}
				} catch {
					return;
				}
				recomputeQuote();
			});
		} catch (err) {
			console.warn('[quote store] RwtVault WS sub failed:', err);
		}

		try {
			const [binArrayPda] = findBinArrayPda(entry.poolPda, programIds.nativeDex);
			binArrayListenerId = wsConn.onAccountChange(binArrayPda, (acc) => {
				if (activePoolKey !== entry.poolPda.toBase58()) return;
				try {
					const bins = parseBinArray(acc.data);
					const has = hasOrganicAskAbove(bins.bins, bins.lowerBinId, bins.activeBinId);
					if (masterPoolContext) {
						masterPoolContext = {
							...masterPoolContext,
							hasOrganicAsk: has
						};
					} else {
						masterPoolContext = { nav: 0n, hasOrganicAsk: has };
					}
				} catch {
					return;
				}
				recomputeQuote();
			});
		} catch (err) {
			console.warn('[quote store] BinArray WS sub failed:', err);
		}
	}

	cycle = {
		wsConn,
		poolListenerId,
		configListenerId,
		rwtVaultListenerId,
		binArrayListenerId
	};
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
	masterPoolContext = null;

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
	masterPoolContext = null;
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
	get masterPoolContext(): MasterPoolQuoteContext | null {
		return masterPoolContext;
	},
	setInput,
	setSlippage,
	activatePool,
	deactivate
};
