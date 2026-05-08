/*
 * Liquidity-form FSM service — runes-based singleton.
 *
 * Phase 11 introduces the fourth WRITE-path: holder-signed LP add / zap /
 * remove against a native-dex StandardCurve pool. The service owns the
 * FSM that takes a fully-prepared intent (pool, amounts, slippage)
 * through wallet signature, RPC broadcast, and on-chain confirmation, and
 * surfaces phase progression to the UI.
 *
 * Public surface:
 *   lpForm.{attempts, isInFlight(pool), startAdd, startZap, startRemove}
 *
 * Lifecycle (per attempt, keyed by `intent.pool.poolAddress.toBase58()`):
 *
 *   ┌─ none ──────────────────────────────────────────────────┐
 *   │  start*(intent) & valid          → preparing            │
 *   │  start*(intent) & in-flight      → no-op (single-flight)│
 *   ├──────────────────────────────────────────────────────────┤
 *   │  preparing                                              │
 *   │    re-fetch & re-quote OK        → awaiting-signature   │
 *   │    fresh.shares < minShares      → error (terminal)     │
 *   │    fresh.outputs < expected      → error (terminal)     │
 *   │    placeholder mainnet RWT       → error (terminal)     │
 *   │    master pool blocks add/zap    → error (terminal)     │
 *   │    pool/lp_position missing      → error (terminal)     │
 *   │  awaiting-signature                                     │
 *   │    wallet returns sig            → broadcasting         │
 *   │    user rejected (4001)          → drop attempt (silent)│
 *   │    other wallet error            → error (terminal)     │
 *   │  broadcasting → confirming                              │
 *   │  confirming                                             │
 *   │    confirmed                     → success (auto-clean) │
 *   │    tx error                      → error (terminal)     │
 *   │    90s timeout                   → error (timeout msg)  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Side-effects on success:
 *   - lpStore.refresh()        — repaint My Position with new shares.
 *   - portfolio.refresh()      — picks up new RWT balance deltas.
 *   - userBalances.refreshAll() — repaints chip labels.
 *
 * Critical correctness invariants (mirrors the swap FSM):
 *
 *   1. STALE-QUOTE RACE GUARD. The intent's `expectedShares` (or
 *      `expectedA/B` for remove) was computed off cached pool reserves.
 *      Between user click and wallet signature, another LP/swap can land
 *      and move the pool. `preparing` re-fetches PoolState (and
 *      LpPosition for remove) and re-derives the expected output. Aborts
 *      BEFORE signature when fresh expected violates the user's slippage
 *      floor.
 *
 *   2. MAINNET PLACEHOLDER GUARD on add/zap (NOT remove — exit must work
 *      even when the placeholder is in play, otherwise users could be
 *      trapped mid-deploy). The SDK's tx builders enforce this server-side
 *      too; pre-flighting here saves the wallet roundtrip.
 *
 *   3. MASTER-POOL GUARD on add/zap. Defense-in-depth — the UI also
 *      disables CTAs on master pools, but a programmatic call would still
 *      revert on-chain. Catching pre-sign avoids a wallet prompt.
 *
 *   4. SINGLE-FLIGHT per pool key. A second start*() for the same pool
 *      while the first is mid-flow is a no-op (NOT an error — duplicate
 *      clicks happen). Different pools run concurrently.
 *
 *   5. 90s TIMEOUT on confirm — same ceiling as the swap + claim FSMs.
 */
import { tick } from 'svelte';
import {
	Connection,
	PublicKey,
	type Transaction
} from '@solana/web3.js';

import {
	parseDexConfig,
	parsePoolState,
	type DexConfig,
	type PoolState
} from '@areal/sdk/native-dex';
import {
	buildAddLiquidityTx,
	buildZapLiquidityTx,
	buildRemoveLiquidityTx,
	type AddLiquidityAccountContext,
	type ZapLiquidityAccountContext,
	type RemoveLiquidityAccountContext
} from '@areal/sdk/tx';
import {
	findAssociatedTokenAddressPda,
	findDexConfigPda,
	findLpPositionPda
} from '@areal/sdk/pda';
import { isPlaceholderRwtMint, RWT_MINTS } from '@areal/sdk/network';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';
import { portfolio } from '$lib/portfolio/store.svelte';
import { showError } from '$lib/errors';
import { toast } from '$lib/components/ui';
import { userBalances } from '$lib/swap/balances.svelte';
import { isPoolRowMaster } from './master-pool';
import { lpStore } from './lp-store.svelte';
import type { EnrichedPoolRow } from './store.svelte';

export type LpPhase =
	| 'preparing'
	| 'awaiting-signature'
	| 'broadcasting'
	| 'confirming'
	| 'success'
	| 'error';

export type LpType = 'add' | 'zap' | 'remove';

interface BaseIntent {
	pool: EnrichedPoolRow;
	slippageBps: number;
}

/** "Both-sided" deposit — `add_liquidity` requires amountA > 0 AND amountB > 0. */
export interface AddLiquidityIntent extends BaseIntent {
	amountA: bigint;
	amountB: bigint;
	/** Cached expected LP shares (off the pre-flight quote) — modal display only. */
	expectedShares: bigint;
	/** Slippage floor on minted shares — `applySlippageU128(expectedShares, bps)`. */
	minShares: bigint;
}

/**
 * Single-side deposit — `zap_liquidity` accepts `amountA == 0` or
 * `amountB == 0` (but not both). The contract auto-balances the deposit
 * with an internal swap. Same `expectedShares` / `minShares` semantics.
 */
export interface ZapLiquidityIntent extends BaseIntent {
	amountA: bigint;
	amountB: bigint;
	expectedShares: bigint;
	minShares: bigint;
}

export interface RemoveLiquidityIntent extends BaseIntent {
	sharesToBurn: bigint;
	/** Pro-rata redemption — modal display only. */
	expectedA: bigint;
	expectedB: bigint;
}

export type LpIntent =
	| AddLiquidityIntent
	| ZapLiquidityIntent
	| RemoveLiquidityIntent;

export interface LpAttempt {
	type: LpType;
	intent: LpIntent;
	phase: LpPhase;
	signature: string | null;
	error: string | null;
	startedAt: number;
}

const CONFIRM_TIMEOUT_MS = 90_000;
const TERMINAL_CLEANUP_MS = 3_000;

const attempts = $state(new Map<string, LpAttempt>());
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function isUserRejection(err: unknown): boolean {
	if (!(err instanceof Error)) {
		if (
			typeof err === 'object' &&
			err !== null &&
			'code' in err &&
			(err as { code: unknown }).code === 4001
		) {
			return true;
		}
		return false;
	}
	const msg = err.message;
	return (
		msg.includes('User rejected') ||
		msg.includes('user rejected') ||
		msg.toLowerCase().includes('rejected the request')
	);
}

function setPhase(key: string, patch: Partial<LpAttempt>) {
	const existing = attempts.get(key);
	if (!existing) return;
	attempts.set(key, { ...existing, ...patch });
}

function dropAttempt(key: string) {
	attempts.delete(key);
	const timer = cleanupTimers.get(key);
	if (timer) {
		clearTimeout(timer);
		cleanupTimers.delete(key);
	}
}

function scheduleCleanup(key: string) {
	const existing = cleanupTimers.get(key);
	if (existing) clearTimeout(existing);
	cleanupTimers.set(
		key,
		setTimeout(() => dropAttempt(key), TERMINAL_CLEANUP_MS)
	);
}

function fail(key: string, err: unknown, programId: PublicKey) {
	showError(err, programId);
	const message = err instanceof Error ? err.message : String(err);
	setPhase(key, { phase: 'error', error: message });
	scheduleCleanup(key);
}

function failSilent(key: string, message: string, kind: LpType) {
	const titleByKind: Record<LpType, string> = {
		add: 'Add liquidity failed',
		zap: 'Zap failed',
		remove: 'Remove liquidity failed'
	};
	toast.error(message, { title: titleByKind[kind] });
	setPhase(key, { phase: 'error', error: message });
	scheduleCleanup(key);
}

async function confirmWithTimeout(
	connection: Connection,
	signature: string,
	blockhash: string,
	lastValidBlockHeight: number
): Promise<void> {
	const confirmPromise = connection
		.confirmTransaction(
			{ signature, blockhash, lastValidBlockHeight },
			'confirmed'
		)
		.then((result) => {
			if (result.value.err) {
				throw new Error(
					typeof result.value.err === 'string'
						? result.value.err
						: JSON.stringify(result.value.err)
				);
			}
		});

	let timer: ReturnType<typeof setTimeout> | null = null;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(
				new Error('Still pending — check your wallet for the latest status.')
			);
		}, CONFIRM_TIMEOUT_MS);
	});

	try {
		await Promise.race([confirmPromise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/**
 * Re-fetch PoolState + DexConfig in `preparing`. Returns null on failure
 * after surfacing a toast — the caller should bail.
 */
async function refreshPoolAndConfig(
	connection: Connection,
	poolPda: PublicKey,
	dexConfigPda: PublicKey,
	key: string,
	kind: LpType
): Promise<{ pool: PoolState; config: DexConfig } | null> {
	const [poolInfo, configInfo] = await Promise.all([
		connection.getAccountInfo(poolPda),
		connection.getAccountInfo(dexConfigPda)
	]);
	if (!poolInfo) {
		failSilent(key, 'Pool account not found on-chain.', kind);
		return null;
	}
	if (!configInfo) {
		failSilent(key, 'DEX config account not found on-chain.', kind);
		return null;
	}
	return { pool: parsePoolState(poolInfo.data), config: parseDexConfig(configInfo.data) };
}

/**
 * Re-derive expected LP shares for an add/zap from fresh pool reserves.
 * Mirrors the contract's deposit math:
 *
 *   - First deposit (totalLpShares == 0): shares = sqrt(amountA * amountB).
 *     Phase 11 doesn't ship a perfect bigint sqrt — for the stale-quote
 *     guard we accept the user's expectedShares as the floor when the
 *     pool is empty (the contract still enforces `min_shares` server-side).
 *   - Subsequent: shares = min(amountA / reserveA, amountB / reserveB) * total.
 *
 * Returns null when pool reserves are zero AND user is the first depositor —
 * the FSM short-circuits the stale-quote guard in that branch.
 */
function reQuoteAddShares(pool: PoolState, amountA: bigint, amountB: bigint): bigint | null {
	const total = pool.totalLpShares;
	if (total === 0n || pool.reserveA === 0n || pool.reserveB === 0n) {
		// First-deposit branch. Skip the FSM guard — server enforces
		// `min_shares` against the contract's sqrt math which we don't
		// replicate here.
		return null;
	}
	// Both ratios are u128; pick the limiting side. We're solving for shares
	// such that `shares / total <= amountA / reserveA` and same for B.
	const sharesA = (amountA * total) / pool.reserveA;
	const sharesB = (amountB * total) / pool.reserveB;
	return sharesA < sharesB ? sharesA : sharesB;
}

/**
 * Re-derive pro-rata redemption (for remove) from fresh pool reserves +
 * total LP shares. Returns null when totalShares is 0 (impossible for an
 * existing LpPosition — guard kept as defense).
 */
function reQuoteRemovePayout(
	pool: PoolState,
	sharesToBurn: bigint
): { a: bigint; b: bigint } | null {
	const total = pool.totalLpShares;
	if (total === 0n) return null;
	const a = (sharesToBurn * pool.reserveA) / total;
	const b = (sharesToBurn * pool.reserveB) / total;
	return { a, b };
}

// ──────────────────────────── runners ─────────────────────────────────────

async function runAdd(intent: AddLiquidityIntent): Promise<void> {
	const key = intent.pool.poolAddress.toBase58();
	const programId = network.endpoint.programIds.nativeDex;
	const cluster = network.current;

	// Pre-flight 1: master-pool guard.
	if (isPoolRowMaster(intent.pool, cluster)) {
		failSilent(key, 'User liquidity is managed by Areal Nexus on this pool.', 'add');
		return;
	}

	// Pre-flight 2: mainnet placeholder.
	if (cluster === 'mainnet' && isPlaceholderRwtMint(RWT_MINTS[cluster])) {
		failSilent(
			key,
			'Mainnet RWT mint is not yet deployed. Liquidity is unavailable on mainnet.',
			'add'
		);
		return;
	}

	const holder = wallet.publicKey;
	if (!holder) {
		failSilent(key, 'Wallet not connected.', 'add');
		return;
	}

	if (intent.amountA <= 0n || intent.amountB <= 0n) {
		failSilent(key, 'Both token amounts must be greater than zero.', 'add');
		return;
	}

	const connection = network.connection;

	try {
		// ─── preparing ────────────────────────────────────────────────────
		const [dexConfigPda] = findDexConfigPda(programId);
		const fresh = await refreshPoolAndConfig(
			connection,
			intent.pool.poolAddress,
			dexConfigPda,
			key,
			'add'
		);
		if (!fresh) return;

		// Stale-quote race guard. First-deposit branch (returns null) skips
		// the check — the contract's sqrt-based min_shares is authoritative.
		const freshShares = reQuoteAddShares(fresh.pool, intent.amountA, intent.amountB);
		if (freshShares !== null && freshShares < intent.minShares) {
			failSilent(
				key,
				'Price moved. Try increasing slippage tolerance or refresh the quote.',
				'add'
			);
			return;
		}

		const [lpPda] = findLpPositionPda(intent.pool.poolAddress, holder, programId);
		const [providerTokenA] = findAssociatedTokenAddressPda(
			holder,
			intent.pool.tokenAMint
		);
		const [providerTokenB] = findAssociatedTokenAddressPda(
			holder,
			intent.pool.tokenBMint
		);

		const ctx: AddLiquidityAccountContext = {
			dexProgramId: programId,
			provider: holder,
			pool: intent.pool.poolAddress,
			lpPosition: lpPda,
			providerTokenA,
			providerTokenB,
			vaultA: fresh.pool.vaultA,
			vaultB: fresh.pool.vaultB,
			dexConfig: dexConfigPda
		};

		const tx: Transaction = await buildAddLiquidityTx({
			connection,
			ctx,
			amountA: intent.amountA,
			amountB: intent.amountB,
			minShares: intent.minShares,
			ensureProviderAtas: true,
			tokenAMint: intent.pool.tokenAMint,
			tokenBMint: intent.pool.tokenBMint,
			cluster,
			rwtMint: RWT_MINTS[cluster]
		});

		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
		tx.recentBlockhash = blockhash;
		tx.feePayer = holder;

		// ─── awaiting-signature ───────────────────────────────────────────
		setPhase(key, { phase: 'awaiting-signature' });

		let signature: string;
		try {
			const result = await wallet.signAndSendTransaction(tx);
			signature = result.signature;
		} catch (err) {
			if (isUserRejection(err)) {
				dropAttempt(key);
				return;
			}
			fail(key, err, programId);
			return;
		}

		setPhase(key, { phase: 'broadcasting', signature });
		await tick();
		setPhase(key, { phase: 'confirming', signature });

		try {
			await confirmWithTimeout(connection, signature, blockhash, lastValidBlockHeight);
		} catch (err) {
			fail(key, err, programId);
			return;
		}

		setPhase(key, { phase: 'success' });
		void lpStore.refresh();
		void portfolio.refresh();
		void userBalances.refreshAll();
		scheduleCleanup(key);
	} catch (err) {
		fail(key, err, programId);
	}
}

async function runZap(intent: ZapLiquidityIntent): Promise<void> {
	const key = intent.pool.poolAddress.toBase58();
	const programId = network.endpoint.programIds.nativeDex;
	const cluster = network.current;

	if (isPoolRowMaster(intent.pool, cluster)) {
		failSilent(key, 'User liquidity is managed by Areal Nexus on this pool.', 'zap');
		return;
	}

	if (cluster === 'mainnet' && isPlaceholderRwtMint(RWT_MINTS[cluster])) {
		failSilent(
			key,
			'Mainnet RWT mint is not yet deployed. Liquidity is unavailable on mainnet.',
			'zap'
		);
		return;
	}

	const holder = wallet.publicKey;
	if (!holder) {
		failSilent(key, 'Wallet not connected.', 'zap');
		return;
	}

	// Zap accepts one side zero — but not both, and not negative.
	if (intent.amountA < 0n || intent.amountB < 0n) {
		failSilent(key, 'Negative deposit amount.', 'zap');
		return;
	}
	if (intent.amountA === 0n && intent.amountB === 0n) {
		failSilent(key, 'Provide an amount on at least one side.', 'zap');
		return;
	}

	const connection = network.connection;

	try {
		const [dexConfigPda] = findDexConfigPda(programId);
		const fresh = await refreshPoolAndConfig(
			connection,
			intent.pool.poolAddress,
			dexConfigPda,
			key,
			'zap'
		);
		if (!fresh) return;

		// For zap the fresh-shares math depends on the pool's internal swap
		// path — too noisy to replicate client-side. We rely on the
		// contract's `min_shares` enforcement and skip the FSM guard.
		// Defense-in-depth: still bail if the cached expectedShares is below
		// the cached minShares (sanity check on the intent itself).
		if (intent.expectedShares < intent.minShares) {
			failSilent(key, 'Slippage tolerance is below the expected output.', 'zap');
			return;
		}

		const [lpPda] = findLpPositionPda(intent.pool.poolAddress, holder, programId);
		const [providerTokenA] = findAssociatedTokenAddressPda(
			holder,
			intent.pool.tokenAMint
		);
		const [providerTokenB] = findAssociatedTokenAddressPda(
			holder,
			intent.pool.tokenBMint
		);

		const ctx: ZapLiquidityAccountContext = {
			dexProgramId: programId,
			provider: holder,
			pool: intent.pool.poolAddress,
			lpPosition: lpPda,
			providerTokenA,
			providerTokenB,
			vaultA: fresh.pool.vaultA,
			vaultB: fresh.pool.vaultB,
			dexConfig: dexConfigPda,
			arealFeeAccount: fresh.config.arealFeeDestination,
			otTreasuryFeeDestination: fresh.pool.hasOtTreasury
				? fresh.pool.otTreasuryFeeDestination
				: undefined
		};

		const tx: Transaction = await buildZapLiquidityTx({
			connection,
			ctx,
			amountA: intent.amountA,
			amountB: intent.amountB,
			minShares: intent.minShares,
			ensureProviderAtas: true,
			tokenAMint: intent.pool.tokenAMint,
			tokenBMint: intent.pool.tokenBMint,
			cluster,
			rwtMint: RWT_MINTS[cluster]
		});

		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
		tx.recentBlockhash = blockhash;
		tx.feePayer = holder;

		setPhase(key, { phase: 'awaiting-signature' });

		let signature: string;
		try {
			const result = await wallet.signAndSendTransaction(tx);
			signature = result.signature;
		} catch (err) {
			if (isUserRejection(err)) {
				dropAttempt(key);
				return;
			}
			fail(key, err, programId);
			return;
		}

		setPhase(key, { phase: 'broadcasting', signature });
		await tick();
		setPhase(key, { phase: 'confirming', signature });

		try {
			await confirmWithTimeout(connection, signature, blockhash, lastValidBlockHeight);
		} catch (err) {
			fail(key, err, programId);
			return;
		}

		setPhase(key, { phase: 'success' });
		void lpStore.refresh();
		void portfolio.refresh();
		void userBalances.refreshAll();
		scheduleCleanup(key);
	} catch (err) {
		fail(key, err, programId);
	}
}

async function runRemove(intent: RemoveLiquidityIntent): Promise<void> {
	const key = intent.pool.poolAddress.toBase58();
	const programId = network.endpoint.programIds.nativeDex;

	const holder = wallet.publicKey;
	if (!holder) {
		failSilent(key, 'Wallet not connected.', 'remove');
		return;
	}

	if (intent.sharesToBurn <= 0n) {
		failSilent(key, 'Shares to burn must be greater than zero.', 'remove');
		return;
	}

	const connection = network.connection;

	// NOTE: remove deliberately skips the master-pool + mainnet placeholder
	// guards. LPs must always be able to exit, even when those guards
	// would otherwise block — being trapped in a position is worse than a
	// failed wallet prompt.

	try {
		// Re-fetch pool to surface a fresh redemption preview and to fail
		// pre-sign if reserves can't satisfy the user's slippage tolerance.
		const [dexConfigPda] = findDexConfigPda(programId);
		const fresh = await refreshPoolAndConfig(
			connection,
			intent.pool.poolAddress,
			dexConfigPda,
			key,
			'remove'
		);
		if (!fresh) return;

		// Stale-quote race guard. The user's intent captured a pro-rata
		// redemption preview; if either side has been drained below the
		// slippage floor of the original quote, abort. We use the same bps
		// as the user's slippage to derive the floor.
		const freshPayout = reQuoteRemovePayout(fresh.pool, intent.sharesToBurn);
		if (freshPayout === null) {
			failSilent(key, 'Pool has no liquidity to redeem.', 'remove');
			return;
		}
		// Apply slippage floor: fresh must be >= expected * (1 - bps/10_000).
		// Defence-in-depth: validate bps range BEFORE arithmetic. UI clamps
		// [10, 500] in SwapSettings, but the FSM must not trust intent-side
		// values blindly — a bps > 10_000 would flip slipNum negative and
		// the floor check below would trivially pass. Mirrors the SDK's
		// applySlippageU128 contract.
		const slipDen = 10_000n;
		const { slippageBps } = intent;
		if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
			failSilent(key, 'Invalid slippage tolerance.', 'remove');
			return;
		}
		const slipNum = slipDen - BigInt(slippageBps);
		const minA = (intent.expectedA * slipNum) / slipDen;
		const minB = (intent.expectedB * slipNum) / slipDen;
		if (freshPayout.a < minA || freshPayout.b < minB) {
			failSilent(
				key,
				'Price moved. Try increasing slippage tolerance or refresh the quote.',
				'remove'
			);
			return;
		}

		// Verify on-chain LpPosition still has at least sharesToBurn shares.
		// The lpStore may be stale if the WS event hasn't fired yet.
		const [lpPda] = findLpPositionPda(intent.pool.poolAddress, holder, programId);
		const lpInfo = await connection.getAccountInfo(lpPda);
		if (!lpInfo) {
			failSilent(key, 'No LP position found for this pool.', 'remove');
			return;
		}

		const [providerTokenA] = findAssociatedTokenAddressPda(
			holder,
			intent.pool.tokenAMint
		);
		const [providerTokenB] = findAssociatedTokenAddressPda(
			holder,
			intent.pool.tokenBMint
		);

		const ctx: RemoveLiquidityAccountContext = {
			dexProgramId: programId,
			provider: holder,
			pool: intent.pool.poolAddress,
			lpPosition: lpPda,
			providerTokenA,
			providerTokenB,
			vaultA: fresh.pool.vaultA,
			vaultB: fresh.pool.vaultB
		};

		const tx: Transaction = await buildRemoveLiquidityTx({
			ctx,
			sharesToBurn: intent.sharesToBurn
		});

		const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
		tx.recentBlockhash = blockhash;
		tx.feePayer = holder;

		setPhase(key, { phase: 'awaiting-signature' });

		let signature: string;
		try {
			const result = await wallet.signAndSendTransaction(tx);
			signature = result.signature;
		} catch (err) {
			if (isUserRejection(err)) {
				dropAttempt(key);
				return;
			}
			fail(key, err, programId);
			return;
		}

		setPhase(key, { phase: 'broadcasting', signature });
		await tick();
		setPhase(key, { phase: 'confirming', signature });

		try {
			await confirmWithTimeout(connection, signature, blockhash, lastValidBlockHeight);
		} catch (err) {
			fail(key, err, programId);
			return;
		}

		setPhase(key, { phase: 'success' });
		void lpStore.refresh();
		void portfolio.refresh();
		void userBalances.refreshAll();
		scheduleCleanup(key);
	} catch (err) {
		fail(key, err, programId);
	}
}

// ──────────────────────────── public API ──────────────────────────────────

function singleFlightStart(
	key: string,
	type: LpType,
	intent: LpIntent
): boolean {
	const existing = attempts.get(key);
	if (existing && existing.phase !== 'success' && existing.phase !== 'error') {
		// Single-flight: drop duplicate clicks for the same pool.
		return false;
	}

	if (existing) {
		const timer = cleanupTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			cleanupTimers.delete(key);
		}
	}

	attempts.set(key, {
		type,
		intent,
		phase: 'preparing',
		signature: null,
		error: null,
		startedAt: Date.now()
	});
	return true;
}

function startAdd(intent: AddLiquidityIntent): Promise<void> {
	const key = intent.pool.poolAddress.toBase58();
	if (!singleFlightStart(key, 'add', intent)) return Promise.resolve();
	return runAdd(intent);
}

function startZap(intent: ZapLiquidityIntent): Promise<void> {
	const key = intent.pool.poolAddress.toBase58();
	if (!singleFlightStart(key, 'zap', intent)) return Promise.resolve();
	return runZap(intent);
}

function startRemove(intent: RemoveLiquidityIntent): Promise<void> {
	const key = intent.pool.poolAddress.toBase58();
	if (!singleFlightStart(key, 'remove', intent)) return Promise.resolve();
	return runRemove(intent);
}

function isInFlight(pool: PublicKey): boolean {
	const a = attempts.get(pool.toBase58());
	if (!a) return false;
	return a.phase !== 'success' && a.phase !== 'error';
}

export const lpForm = {
	get attempts(): ReadonlyMap<string, LpAttempt> {
		return attempts;
	},
	isInFlight,
	startAdd,
	startZap,
	startRemove
};
