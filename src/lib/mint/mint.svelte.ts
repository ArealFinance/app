/*
 * Mint service — runes-based singleton.
 *
 * Phase 10 introduces the third user write-path (after Phase 7 claim,
 * Phase 8 swap): holder-signed `mint_rwt` against the singleton RwtVault.
 * The service owns the FSM that takes a fully-prepared `MintIntent`
 * (amount, minRwtOut, NAV-at-quote, fees) from "user clicked Mint"
 * through wallet signature, RPC broadcast, and on-chain confirmation,
 * and surfaces phase progression to the UI.
 *
 * Public surface:
 *   mint.{attempts, isInFlight(), start(intent)}
 *
 * Single-flight key = the literal string `'mint'` — RwtVault is a
 * singleton, so only one mint can be in-flight per user at a time. This
 * also lets the UI subscribe to one well-known attempt regardless of
 * route mounts.
 *
 * Lifecycle (per attempt, keyed by `'mint'`):
 *
 *   ┌─ none ──────────────────────────────────────────────────┐
 *   │  start(intent) & valid          → preparing             │
 *   │  start(intent) & in-flight      → no-op (single-flight) │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  preparing                                              │
 *   │    re-fetch & re-quote OK       → awaiting-signature    │
 *   │    fresh.rwtOut < minRwtOut     → error (terminal)      │
 *   │    mintPaused flipped on        → error (terminal)      │
 *   │    placeholder mainnet RWT      → error (terminal)      │
 *   │    vault missing                → error (terminal)      │
 *   │  awaiting-signature                                     │
 *   │    wallet returns sig           → broadcasting          │
 *   │    user rejected (4001 / msg)   → drop attempt (silent) │
 *   │    other wallet error           → error (terminal)      │
 *   │  broadcasting → confirming                              │
 *   │  confirming                                             │
 *   │    confirmed                    → success (auto-clean 3s)│
 *   │    tx error                     → error (terminal)      │
 *   │    90s timeout                  → error (timeout msg)   │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Side-effects on success:
 *   - portfolio.refresh() — picks up the new RWT balance.
 *   - userBalances.refreshAll() — repaints the From/To token chips on
 *     the form.
 *
 * Critical correctness invariants:
 *
 *   1. STALE-NAV RACE GUARD. The intent's `expectedRwt` is computed off a
 *      cached vault snapshot + 200ms-debounced quote — between the user
 *      clicking "Mint" and the wallet popping up, another mint can land
 *      that moves NAV. We re-fetch the vault in the `preparing` phase,
 *      re-quote, and abort BEFORE signature if
 *      `freshQuote.rwtOut < intent.minRwtOut`. The contract's own
 *      `SlippageExceeded` check is a fallback; failing pre-sign is
 *      strictly better UX (no wallet prompt for a tx that will revert).
 *
 *   2. PAUSED FLIP GUARD. The vault's `mintPaused` flag can flip between
 *      quote and confirm. We re-check in `preparing` and refuse to sign
 *      a tx the contract would reject with `MintPaused`.
 *
 *   3. MAINNET PLACEHOLDER GUARD. Refuse to build a mainnet mint that
 *      touches the R20 placeholder RWT mint — `buildMintRwtTx` enforces
 *      this too, but we surface the error before the RPC roundtrip.
 *
 *   4. SINGLE-FLIGHT. A second `start()` while the first is mid-flow is a
 *      no-op (NOT an error — duplicate clicks happen).
 *
 *   5. 90s TIMEOUT on confirm — same ceiling as the claim and swap FSMs.
 */
import { tick } from 'svelte';
import {
	Connection,
	PublicKey,
	type Transaction
} from '@solana/web3.js';

import {
	parseRwtVault,
	quoteMintRwt,
	type MintQuoteFees
} from '@areal/sdk/rwt-engine';
import { buildMintRwtTx, type MintRwtAccountContext } from '@areal/sdk/tx';
import { findAssociatedTokenAddressPda, findRwtVaultPda } from '@areal/sdk/pda';
import { isPlaceholderRwtMint, RWT_MINTS, USDC_MINTS } from '@areal/sdk/network';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';
import { portfolio } from '$lib/portfolio/store.svelte';
import { showError } from '$lib/errors';
import { toast } from '$lib/components/ui';
import { userBalances } from '$lib/swap/balances.svelte';

export type MintPhase =
	| 'preparing'
	| 'awaiting-signature'
	| 'broadcasting'
	| 'confirming'
	| 'success'
	| 'error';

/**
 * Frozen mint parameters captured at the moment the user clicks Mint. The
 * FSM re-validates these against fresh on-chain state in `preparing`.
 */
export interface MintIntent {
	/** USDC lamports the user is depositing. */
	amountIn: bigint;
	/** Slippage floor on RWT side (post-applyMintSlippage). */
	minRwtOut: bigint;
	/** Cached pre-confirm expected RWT — modal display only. */
	expectedRwt: bigint;
	/** Cached NAV used to price this mint — modal display only. */
	navAtQuote: bigint;
	/** Cached post-mint NAV (vault state after this mint applies) — modal
	 *  display only. Pairs with `navAtQuote` to show the user the NAV
	 *  delta their mint induces (typically a small upward push from the
	 *  vault-fee accrual). */
	navAfter: bigint;
	/** Cached fee breakdown — modal display only. */
	fees: MintQuoteFees;
	/** Slippage in bps the user picked. */
	slippageBps: number;
}

export interface MintAttempt {
	phase: MintPhase;
	intent: MintIntent;
	signature: string | null;
	error: string | null;
	startedAt: number;
}

const MINT_KEY = 'mint';
const CONFIRM_TIMEOUT_MS = 90_000;
const TERMINAL_CLEANUP_MS = 3_000;

const attempts = $state(new Map<string, MintAttempt>());

/** Per-attempt cleanup timers, keyed by attempt key (always `'mint'`). */
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

function setPhase(key: string, patch: Partial<MintAttempt>) {
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

function failSilent(key: string, message: string) {
	// Pre-sign error path: surface a toast but don't expose a raw thrown
	// value to `showError` (we built the message ourselves and it's
	// user-friendly already).
	toast.error(message, { title: 'Mint failed' });
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
			reject(new Error('Still pending — check your wallet for the latest status.'));
		}, CONFIRM_TIMEOUT_MS);
	});

	try {
		await Promise.race([confirmPromise, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

async function runMint(intent: MintIntent): Promise<void> {
	const key = MINT_KEY;
	const programId = network.endpoint.programIds.rwtEngine;
	const cluster = network.current;

	// Pre-flight 1: mainnet must not touch the R20 placeholder RWT mint.
	// Use `network.rwtMint` (override-aware) so Testnet picks up the
	// bootstrap-init non-canonical mint instead of the SDK default.
	const rwtMint = network.rwtMint;
	if (cluster === 'mainnet' && isPlaceholderRwtMint(rwtMint)) {
		failSilent(
			key,
			'Mainnet RWT mint is not yet deployed. Minting is unavailable on mainnet.'
		);
		return;
	}

	const holder = wallet.publicKey;
	if (!holder) {
		failSilent(key, 'Wallet not connected.');
		return;
	}

	const connection = network.connection;
	const usdcMint = network.usdcMint;
	const [vaultPda] = findRwtVaultPda(programId);

	try {
		// ─── preparing ────────────────────────────────────────────────────
		// Re-fetch vault — the cached quote was computed off debounced state
		// and another mint can land between click and signature.
		const vaultInfo = await connection.getAccountInfo(vaultPda);
		if (!vaultInfo) {
			failSilent(key, 'RWT vault is not deployed on this network.');
			return;
		}

		let freshVault;
		try {
			freshVault = parseRwtVault(vaultInfo.data);
		} catch {
			failSilent(key, 'RWT vault account is malformed.');
			return;
		}

		// Paused-flip guard: refuse to sign a tx that the contract would
		// revert with `MintPaused`.
		if (freshVault.mintPaused) {
			failSilent(key, 'Minting is currently paused.');
			return;
		}

		const freshQuote = quoteMintRwt({
			vault: freshVault,
			amountIn: intent.amountIn,
			cluster,
			rwtMint
		});

		if (!freshQuote.ok) {
			failSilent(
				key,
				`Cannot price mint: ${freshQuote.error}.`
			);
			return;
		}

		// Stale-NAV race guard: refuse to sign a tx the contract would
		// revert with `SlippageExceeded`.
		if (freshQuote.quote.rwtOut < intent.minRwtOut) {
			failSilent(
				key,
				'NAV moved. Try increasing slippage tolerance or refresh the quote.'
			);
			return;
		}

		// Resolve mint-side context. `rwtMint`, `capitalAcc`, and
		// `arealFeeDestination` are pinned on the vault account at deploy
		// time — pass through what we just parsed.
		const ctx: MintRwtAccountContext = {
			rwtEngineProgramId: programId,
			user: holder,
			rwtVault: vaultPda,
			rwtMint: freshVault.rwtMint,
			capitalAcc: freshVault.capitalAccumulatorAta,
			daoFeeAccount: freshVault.arealFeeDestination
		};

		// User's USDC source ATA + RWT destination ATA.
		const [userDeposit] = findAssociatedTokenAddressPda(holder, usdcMint);
		const [userRwt] = findAssociatedTokenAddressPda(holder, freshVault.rwtMint);

		const tx: Transaction = await buildMintRwtTx({
			connection,
			ctx,
			userDeposit,
			userRwt,
			amount: intent.amountIn,
			minRwtOut: intent.minRwtOut,
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
		// Same rationale as the claim/swap FSMs: Svelte runes batch
		// synchronous state mutations, so without a tick boundary the
		// broadcasting phase would never be observable.
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
		// RWT balance immediately. WS would also fire (vault state changed,
		// user ATA changed), but explicit refresh closes the loop fast.
		void portfolio.refresh();
		void userBalances.refreshAll();
		scheduleCleanup(key);
	} catch (err) {
		fail(key, err, programId);
	}
}

function start(intent: MintIntent): Promise<void> {
	const key = MINT_KEY;

	// Single-flight: drop duplicate clicks while in-flight.
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
		phase: 'preparing',
		intent,
		signature: null,
		error: null,
		startedAt: Date.now()
	});

	return runMint(intent);
}

function isInFlight(): boolean {
	const a = attempts.get(MINT_KEY);
	if (!a) return false;
	return a.phase !== 'success' && a.phase !== 'error';
}

export const mint = {
	get attempts(): ReadonlyMap<string, MintAttempt> {
		return attempts;
	},
	isInFlight,
	start
};
