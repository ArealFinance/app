/*
 * Swap service — runes-based singleton.
 *
 * Phase 8 introduces the second WRITE-path: holder-signed swap against a
 * native-dex StandardCurve pool. The service owns the FSM that takes a
 * fully-prepared `SwapIntent` (pool, amounts, slippage) from "user clicked
 * Swap" through wallet signature, RPC broadcast, and on-chain confirmation,
 * and surfaces phase progression to the UI.
 *
 * Public surface:
 *   swap.{attempts, isInFlight(pool), start(intent)}
 *
 * Lifecycle (per attempt, keyed by `intent.poolEntry.poolPda.toBase58()`):
 *
 *   ┌─ none ──────────────────────────────────────────────────┐
 *   │  start(intent) & valid          → preparing             │
 *   │  start(intent) & in-flight      → no-op (single-flight) │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  preparing                                              │
 *   │    re-fetch & re-quote OK       → awaiting-signature    │
 *   │    fresh.amountOut < minOut     → error (terminal)      │
 *   │    placeholder mainnet RWT      → error (terminal)      │
 *   │    pool/config missing          → error (terminal)      │
 *   │  awaiting-signature                                     │
 *   │    wallet returns sig           → broadcasting          │
 *   │    user rejected (4001)         → drop attempt (silent) │
 *   │    other wallet error           → error (terminal)      │
 *   │  broadcasting → confirming                              │
 *   │  confirming                                             │
 *   │    confirmed                    → success (auto-clean 3s)│
 *   │    tx error                     → error (terminal)      │
 *   │    90s timeout                  → error (timeout msg)   │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Side-effects on success:
 *   - portfolio.refresh() — picks up new RWT balance / OT entitlement
 *     deltas immediately. The portfolio store's WS subs would also fire
 *     via the post-swap pool/balance change, but a direct refresh closes
 *     the loop deterministically.
 *   - userBalances.refreshAll() — repaints the From/To token chips with
 *     post-swap balances.
 *
 * Critical correctness invariants:
 *
 *   1. STALE-QUOTE RACE GUARD. The intent's `expectedOut` is computed off
 *      cached pool reserves and a 200ms-debounced quote — between the
 *      user clicking "Swap" and the wallet popping up, another swap can
 *      land that moves the pool. We re-fetch the pool + config in the
 *      `preparing` phase, re-quote with fresh reserves, and abort BEFORE
 *      signature if `freshQuote.amountOut < intent.minAmountOut`. The
 *      contract's own `SlippageExceeded` check is a fallback; failing
 *      pre-sign is a strictly better UX (no wallet prompt for a tx that
 *      will revert).
 *
 *   2. MAINNET PLACEHOLDER GUARD. Refuse to build a mainnet swap that
 *      touches the R20 placeholder RWT mint — `buildSwapTx` enforces this
 *      too, but we surface the error before the RPC roundtrip.
 *
 *   3. SINGLE-FLIGHT per pool key. A second `start()` for the same pool
 *      while the first is mid-flow is a no-op (NOT an error — duplicate
 *      clicks happen). Different pools run concurrently.
 *
 *   4. 90s TIMEOUT on confirm — same ceiling as the claim FSM.
 */
import { tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import {
	Connection,
	PublicKey,
	SolanaJSONRPCError,
	type Transaction
} from '@solana/web3.js';

import {
	parseDexConfig,
	parsePoolState,
	quoteSwap,
	type QuoteFees
} from '@areal/sdk/native-dex';
import { buildSwapTx, type SwapAccountContext } from '@areal/sdk/tx';
import { findAssociatedTokenAddressPda, findBinArrayPda } from '@areal/sdk/pda';
import { isPlaceholderRwtMint, RWT_MINTS } from '@areal/sdk/network';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';
import { portfolio } from '$lib/portfolio/store.svelte';
import { showError } from '$lib/errors';
import { toast } from '$lib/components/ui';
import { formatTokenAmount } from '$lib/portfolio/format';
import { userBalances } from './balances.svelte';
import type { PoolEntry } from './pool-catalogue';

export type SwapPhase =
	| 'preparing'
	| 'awaiting-signature'
	| 'broadcasting'
	| 'confirming'
	| 'success'
	| 'error';

/**
 * Frozen swap parameters captured at the moment the user clicks Swap. The
 * FSM re-validates these against fresh on-chain state in `preparing`.
 */
export interface SwapIntent {
	poolEntry: PoolEntry;
	/** Mint the user is paying with (one of poolEntry.mintA / mintB). */
	fromMint: PublicKey;
	/** Mint the user is receiving. */
	toMint: PublicKey;
	/** True when fromMint == poolEntry.mintA (canonical token-A side). */
	aToB: boolean;
	/** Lamports of `fromMint` to swap in. */
	amountIn: bigint;
	/** Slippage floor on output side (post-applySlippage). */
	minAmountOut: bigint;
	/** Cached pre-confirm expected output — modal display only. */
	expectedOut: bigint;
	/** Cached fee breakdown — modal display only. */
	fees: QuoteFees;
	/** Cached price impact (bps). */
	priceImpactBps: number;
	/** Slippage in bps the user picked. */
	slippageBps: number;
	/** Wallet debit total in `fromMint` lamports — equals amountIn + fees on the sell-RWT branch; equals amountIn on buy-RWT. */
	userTotalDebit: bigint;
}

export interface SwapAttempt {
	poolBase58: string;
	intent: SwapIntent;
	phase: SwapPhase;
	signature: string | null;
	error: string | null;
	startedAt: number;
}

const CONFIRM_TIMEOUT_MS = 90_000;
// FSM cleanup must outlast the SwapConfirmModal's success auto-dismiss
// (also 3 s). Otherwise the two timers race: if the FSM drops the
// attempt first, `currentAttempt` flips to `null` while the modal is
// still mounted, and Svelte re-renders the modal into its
// `attempt === null` branch (the pre-confirm "CONFIRM SWAP" view).
// 5 s gives the modal a 2 s safety margin to finish closing.
const TERMINAL_CLEANUP_MS = 5_000;

const attempts = new SvelteMap<string, SwapAttempt>();

/** Per-attempt cleanup timers, keyed by poolBase58. */
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Distinguish "ATA does not exist" (a normal pre-condition for first-time
 * holders) from real RPC failures (timeout, 500, network partition). The
 * Solana JSON-RPC server returns `code: -32602` (Invalid params) with a
 * message containing "could not find account" / "Invalid param" when the
 * queried token account is missing. Match by both code and message text —
 * the code by itself is overloaded (any malformed param trips -32602), and
 * non-stock RPC providers occasionally surface the same condition with a
 * slightly different wording. Belt-and-braces: also accept a plain `Error`
 * whose message carries the substring, since some upstreams unwrap the
 * SolanaJSONRPCError class boundary.
 */
function isAccountNotFoundError(err: unknown): boolean {
	if (err instanceof SolanaJSONRPCError) {
		// -32602 Invalid params is the canonical signal for missing account.
		// Pair with a message check so we don't swallow unrelated param errors.
		const msg = err.message.toLowerCase();
		return (
			err.code === -32602 &&
			(msg.includes('could not find account') || msg.includes('invalid param'))
		);
	}
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		return (
			msg.includes('could not find account') ||
			msg.includes('account does not exist')
		);
	}
	return false;
}

/**
 * Read the holder's `fromMint` ATA balance for the preflight check.
 *
 *   - `0n` when the ATA hasn't been created yet (a missing ATA implies zero
 *     balance — `buildSwapTx({ ensureAta: true })` will mint it for us).
 *   - `null` on any other RPC failure (timeout, 5xx, network partition,
 *     malformed response). The caller MUST treat this as "balance unknown"
 *     and fail-open the preflight rather than false-positive an
 *     "Insufficient balance" abort for a fully funded wallet during a
 *     transient blip. The contract still enforces the balance check
 *     server-side, so the worst case is a wasted wallet prompt — much
 *     better UX than refusing to even ask for a signature.
 *
 * Mirrors the `userBalances.readBalance` helper but takes a Connection
 * directly so we pin to the same instance the FSM used for the rest of the
 * preparing phase.
 */
async function readUserBalance(
	connection: Connection,
	owner: PublicKey,
	mint: PublicKey
): Promise<bigint | null> {
	const [ata] = findAssociatedTokenAddressPda(owner, mint);
	try {
		const res = await connection.getTokenAccountBalance(ata);
		return BigInt(res.value.amount);
	} catch (err) {
		if (isAccountNotFoundError(err)) return 0n;
		// Transient RPC failure — log for observability and let the caller
		// decide. Returning `null` (vs re-throwing) keeps the preflight a
		// soft gate: a stale-quote / mainnet-placeholder check still aborts,
		// but a one-off `getTokenAccountBalance` flake doesn't.
		console.warn('readUserBalance: RPC failure, skipping preflight', err);
		return null;
	}
}

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

function setPhase(key: string, patch: Partial<SwapAttempt>) {
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

function failSilent(key: string, message: string, programId: PublicKey) {
	// Pre-sign error path: surface a toast but don't expose a raw thrown
	// value to `showError` (we built the message ourselves and it's
	// user-friendly already).
	void programId;
	toast.error(message, { title: 'Swap failed' });
	setPhase(key, { phase: 'error', error: message });
	scheduleCleanup(key);
}

/**
 * Confirm via `getSignatureStatuses` polling. Same WS-neuter rationale
 * as `claim.svelte.ts` / `lp-claim.svelte.ts` / `lp-form.svelte.ts` —
 * see those files for the full incident write-up. tl;dr:
 * `connection.confirmTransaction()` resolves on an `onSignature` WS
 * subscription that our Testnet Connection neuters, so it never returns
 * until `lastValidBlockHeight` passes and reverts as "block height
 * exceeded".
 */
async function confirmWithTimeout(
	connection: Connection,
	signature: string,
	_blockhash: string,
	lastValidBlockHeight: number
): Promise<void> {
	const POLL_INTERVAL_MS = 1500;
	let stopped = false;

	const pollLoop = async (): Promise<void> => {
		while (!stopped) {
			try {
				const { value } = await connection.getSignatureStatuses([signature], {
					searchTransactionHistory: false
				});
				const status = value[0];
				if (status) {
					if (status.err) {
						throw new Error(
							typeof status.err === 'string'
								? status.err
								: JSON.stringify(status.err)
						);
					}
					if (
						status.confirmationStatus === 'confirmed' ||
						status.confirmationStatus === 'finalized'
					) {
						return;
					}
				}
			} catch (err) {
				if (
					err instanceof Error &&
					/^[A-Z][a-zA-Z]+(?:Error)?:/.test(err.message)
				) {
					throw err;
				}
			}

			try {
				const currentHeight = await connection.getBlockHeight('confirmed');
				if (currentHeight > lastValidBlockHeight) {
					throw new Error(
						'Transaction blockhash expired before confirmation. Please retry.'
					);
				}
			} catch (err) {
				if (
					err instanceof Error &&
					err.message.startsWith('Transaction blockhash expired')
				) {
					throw err;
				}
			}

			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		}
	};

	let timer: ReturnType<typeof setTimeout> | null = null;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(new Error('Still pending — check your wallet for the latest status.'));
		}, CONFIRM_TIMEOUT_MS);
	});

	try {
		await Promise.race([pollLoop(), timeout]);
	} finally {
		stopped = true;
		if (timer) clearTimeout(timer);
	}
}

async function runSwap(intent: SwapIntent): Promise<void> {
	const key = intent.poolEntry.poolPda.toBase58();
	const programId = network.endpoint.programIds.nativeDex;
	const cluster = network.current;

	// Pre-flight 1: mainnet must not touch the R20 placeholder RWT mint.
	// Use `network.rwtMint` (override-aware) so Testnet picks up the
	// bootstrap-init non-canonical mint instead of the SDK default.
	const rwtMint = network.rwtMint;
	if (cluster === 'mainnet' && isPlaceholderRwtMint(rwtMint)) {
		failSilent(
			key,
			'Mainnet RWT mint is not yet deployed. Trading is unavailable on mainnet.',
			programId
		);
		return;
	}

	const holder = wallet.publicKey;
	if (!holder) {
		failSilent(key, 'Wallet not connected.', programId);
		return;
	}

	const connection = network.connection;

	try {
		// ─── preparing ────────────────────────────────────────────────────
		// Re-fetch pool + config — the cached quote was computed off
		// debounced state and the pool can move between click and signature.
		const [poolInfo, configInfo] = await Promise.all([
			connection.getAccountInfo(intent.poolEntry.poolPda),
			connection.getAccountInfo(intent.poolEntry.dexConfigPda)
		]);

		if (!poolInfo) {
			failSilent(key, 'Pool account not found on-chain.', programId);
			return;
		}
		if (!configInfo) {
			failSilent(key, 'DEX config account not found on-chain.', programId);
			return;
		}

		const freshPool = parsePoolState(poolInfo.data);
		const freshConfig = parseDexConfig(configInfo.data);

		const freshQuote = quoteSwap({
			pool: freshPool,
			config: freshConfig,
			amountIn: intent.amountIn,
			aToB: intent.aToB,
			rwtMint
		});

		if (!freshQuote.ok) {
			failSilent(
				key,
				`Cannot price swap: ${freshQuote.error}.`,
				programId
			);
			return;
		}

		// Stale-quote race guard: refuse to sign a tx that the contract
		// would revert with SlippageExceeded.
		if (freshQuote.quote.amountOut < intent.minAmountOut) {
			failSilent(
				key,
				'Price moved. Try increasing slippage tolerance or refresh the quote.',
				programId
			);
			return;
		}

		// Balance preflight against the docs-compliant `userTotalDebit` —
		// for sell-RWT swaps the wallet is debited `amountIn + fees` (fees
		// on top), so checking `amountIn` alone would let a swap through
		// that the SPL transfer would revert with "insufficient funds".
		// Buy-RWT collapses to `amountIn` (fees come off the gross output).
		//
		// `readUserBalance` returns `null` on transient RPC failures (not
		// account-not-found). When that happens we fail-open: skip the
		// preflight and let the contract enforce the balance check. The
		// alternative — false-positive "Insufficient balance" on an RPC
		// blip with a fully funded wallet — is strictly worse UX (APP-H1).
		const fromDecimals = intent.aToB ? intent.poolEntry.decimalsA : intent.poolEntry.decimalsB;
		const userTotalDebit = freshQuote.quote.userTotalDebit;
		const fromBalance = await readUserBalance(connection, holder, intent.fromMint);
		if (fromBalance !== null && fromBalance < userTotalDebit) {
			failSilent(
				key,
				`Insufficient balance: need ${formatTokenAmount(userTotalDebit, fromDecimals, fromDecimals)} including fees, have ${formatTokenAmount(fromBalance, fromDecimals, fromDecimals)}.`,
				programId
			);
			return;
		}

		// Concentrated pools require the BinArray PDA as a remaining_account
		// (`["bins", pool_state]`). The contract gates the load on
		// `pool.poolType == 1`; we derive eagerly only for that branch so
		// standard pools stay zero-overhead.
		const isConcentrated = freshPool.poolType === 1;
		const binArray = isConcentrated
			? findBinArrayPda(intent.poolEntry.poolPda, programId)[0]
			: undefined;

		// Resolve pool-side context. `vaultA` / `vaultB` come from
		// PoolState; `arealFeeAccount` comes from DexConfig.
		const ctx: SwapAccountContext = {
			dexProgramId: programId,
			user: holder,
			dexConfig: intent.poolEntry.dexConfigPda,
			pool: intent.poolEntry.poolPda,
			vaultA: freshPool.vaultA,
			vaultB: freshPool.vaultB,
			arealFeeAccount: freshConfig.arealFeeDestination,
			otTreasuryFeeDestination: freshPool.hasOtTreasury
				? freshPool.otTreasuryFeeDestination
				: undefined,
			binArray
		};

		// User's input/output ATAs — derived deterministically (no RPC).
		const [userTokenIn] = findAssociatedTokenAddressPda(holder, intent.fromMint);
		const [userTokenOut] = findAssociatedTokenAddressPda(holder, intent.toMint);

		const tx: Transaction = await buildSwapTx({
			connection,
			ctx,
			userTokenIn,
			userTokenOut,
			outputMint: intent.toMint,
			aToB: intent.aToB,
			amountIn: intent.amountIn,
			minAmountOut: intent.minAmountOut,
			ensureAta: true,
			cluster,
			rwtMint
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

		// ─── broadcasting → confirming ────────────────────────────────────
		setPhase(key, { phase: 'broadcasting', signature });
		// Flush the broadcasting phase to the UI before the next transition.
		// Same rationale as the claim FSM: Svelte runes batch synchronous
		// state mutations, so without a tick boundary the broadcasting
		// phase would never be observable.
		await tick();
		setPhase(key, { phase: 'confirming', signature });

		try {
			await confirmWithTimeout(connection, signature, blockhash, lastValidBlockHeight);
		} catch (err) {
			fail(key, err, programId);
			return;
		}

		// ─── success ──────────────────────────────────────────────────────
		setPhase(key, { phase: 'success' });
		// Refresh portfolio + user balances so the UI reflects the new
		// position immediately. WS would also fire (pool reserves changed,
		// user ATA changed), but explicit refresh closes the loop fast.
		void portfolio.refresh();
		void userBalances.refreshAll();
		scheduleCleanup(key);
	} catch (err) {
		fail(key, err, programId);
	}
}

function start(intent: SwapIntent): Promise<void> {
	const key = intent.poolEntry.poolPda.toBase58();

	// Single-flight: drop duplicate clicks for the same pool.
	const existing = attempts.get(key);
	if (existing && existing.phase !== 'success' && existing.phase !== 'error') {
		return Promise.resolve();
	}

	// Replace stale terminal attempt — clear its pending cleanup timer so
	// the new attempt isn't dropped by the old one's deadline.
	if (existing) {
		const timer = cleanupTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			cleanupTimers.delete(key);
		}
	}

	attempts.set(key, {
		poolBase58: key,
		intent,
		phase: 'preparing',
		signature: null,
		error: null,
		startedAt: Date.now()
	});

	return runSwap(intent);
}

function isInFlight(pool: PublicKey): boolean {
	const a = attempts.get(pool.toBase58());
	if (!a) return false;
	return a.phase !== 'success' && a.phase !== 'error';
}

export const swap = {
	get attempts(): ReadonlyMap<string, SwapAttempt> {
		return attempts;
	},
	isInFlight,
	start
};
