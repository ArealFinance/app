/*
 * LP-fees claim service — runes-based singleton.
 *
 * User-signed write path for `native-dex::claim_lp_fees`. Mirrors the
 * `claim.svelte.ts` FSM exactly, swapping the OT-yield distributor flow for
 * the LP-position fee-pull flow. Single-flight per LP-position address —
 * different positions claim concurrently.
 *
 * Public surface:
 *   lpClaims.{attempts, isInFlight(positionAddress), start(row)}
 *
 * Lifecycle (per attempt, keyed by `positionAddress.toBase58()`):
 *
 *   ┌─ none ──────────────────────────────────────────────────────┐
 *   │  start(row) & nothing-claimable → no-op (toast only)        │
 *   │  start(row) & in-flight         → no-op (single-flight)     │
 *   │  start(row) & wallet missing    → error (terminal)          │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  preparing → awaiting-signature                             │
 *   │  awaiting-signature                                         │
 *   │      wallet returns sig         → broadcasting              │
 *   │      user rejected (4001)       → drop attempt (silent)     │
 *   │      other wallet error         → error (terminal)          │
 *   │  broadcasting → confirming                                  │
 *   │  confirming                                                 │
 *   │      confirmed                  → success (auto-clean 3s)   │
 *   │      tx error                   → error (terminal)          │
 *   │      90s timeout                → error (timeout msg)       │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Side-effects:
 *   - On `success`, call `lpPortfolio.refresh()` so the row's
 *     `feesClaimedPerShare{A,B}` snapshot updates immediately. The portfolio
 *     store's WS subscription would also fire, but a direct refresh closes
 *     the loop deterministically.
 *   - User rejections (Phantom string, Solflare 4001) drop silently — no
 *     toast, no error state. Mirrors the OT-claim policy.
 *
 * Critical correctness invariants:
 *
 *   1. SINGLE-FLIGHT per LP position (keyed by positionAddress.toBase58()).
 *      Different positions can claim in parallel. Duplicate clicks for the
 *      same position are silently dropped.
 *
 *   2. NOTHING-CLAIMABLE PRE-FLIGHT. When the position's
 *      `feesClaimedPerShare{A,B}` already equals the pool's
 *      `cumulativeFeesPerShare{A,B}` (both sides), the user has nothing to
 *      pull. Surface a warning toast and return early — no FSM entry.
 *      Defensive: the page-level button is also disabled in this state.
 *
 *   3. 90s CONFIRM TIMEOUT. Bounds the confirm step at 90s and surfaces a
 *      "still pending" message. ClaimLpFees has no replay-safety oddities
 *      (it's idempotent against the same fee-share snapshot), but a
 *      duplicate broadcast would be wasted gas — tell the user to wait.
 */
import { tick } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { Connection, PublicKey, type Transaction } from '@solana/web3.js';

import { buildClaimLpFeesTx } from '@areal/sdk/tx';
import { findAssociatedTokenAddressPda } from '@areal/sdk/pda';
import type { HolderLpRow } from '@areal/sdk/lp-portfolio';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';
import { lpPortfolio } from '$lib/portfolio/lp-portfolio-store.svelte';
import { showError } from '$lib/errors';
import { toast } from '$lib/components/ui';

export type LpClaimPhase =
	| 'preparing'
	| 'awaiting-signature'
	| 'broadcasting'
	| 'confirming'
	| 'success'
	| 'error';

export interface LpClaimAttempt {
	positionAddressBase58: string;
	poolAddressBase58: string;
	phase: LpClaimPhase;
	signature: string | null;
	error: string | null;
	startedAt: number;
}

const CONFIRM_TIMEOUT_MS = 90_000;
const TERMINAL_CLEANUP_MS = 3_000;

const attempts = new SvelteMap<string, LpClaimAttempt>();

/** Per-attempt cleanup timers, keyed by positionAddressBase58. */
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function isUserRejection(err: unknown): boolean {
	if (!(err instanceof Error)) {
		// Phantom/Solflare may emit `{ code: 4001, message: 'User rejected …' }`
		// without subclassing Error — handle the duck-typed shape too.
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

function setPhase(key: string, patch: Partial<LpClaimAttempt>) {
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
	// User-rejection has already been handled in the call sites that need
	// silent revert; remaining errors get a toast + visible error phase.
	showError(err, programId);
	const message = err instanceof Error ? err.message : String(err);
	setPhase(key, { phase: 'error', error: message });
	scheduleCleanup(key);
}

/** Run `connection.confirmTransaction` with a hard 90s ceiling. */
async function confirmWithTimeout(
	connection: Connection,
	signature: string,
	blockhash: string,
	lastValidBlockHeight: number
): Promise<void> {
	const confirmPromise = connection
		.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
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

/**
 * True iff BOTH fee-share snapshots on the position already equal the pool's
 * cumulative-per-share — i.e. there is nothing for the holder to pull.
 */
function hasNothingToClaim(row: HolderLpRow): boolean {
	return (
		row.pool.cumulativeFeesPerShareA === row.position.feesClaimedPerShareA &&
		row.pool.cumulativeFeesPerShareB === row.position.feesClaimedPerShareB
	);
}

async function runClaim(row: HolderLpRow): Promise<void> {
	const key = row.positionAddress.toBase58();
	const programId = network.endpoint.programIds.nativeDex;

	const holder = wallet.publicKey;
	if (!holder) {
		setPhase(key, { phase: 'error', error: 'Wallet not connected.' });
		toast.error('Wallet not connected.', { title: 'Cannot claim' });
		scheduleCleanup(key);
		return;
	}

	const connection = network.connection;

	try {
		// Derive recipient ATAs for both sides — `ensureRecipientAtas: true`
		// will RPC-check them and prepend create-idempotent ix(s) inside
		// `buildClaimLpFeesTx`, so we just pass the addresses.
		const [recipientTokenAAta] = findAssociatedTokenAddressPda(holder, row.pool.tokenAMint);
		const [recipientTokenBAta] = findAssociatedTokenAddressPda(holder, row.pool.tokenBMint);

		const tx: Transaction = await buildClaimLpFeesTx({
			connection,
			ctx: {
				dexProgramId: programId,
				recipient: holder,
				pool: row.poolAddress,
				lpPosition: row.positionAddress,
				poolVaultA: row.pool.vaultA,
				poolVaultB: row.pool.vaultB,
				recipientTokenAAta,
				recipientTokenBAta
			},
			ensureRecipientAtas: true,
			tokenAMint: row.pool.tokenAMint,
			tokenBMint: row.pool.tokenBMint
		});

		// Set blockhash + payer before handing to the wallet — providers
		// expect a fully-prepared tx.
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
				// Silent revert — user explicitly cancelled. No toast, drop
				// the attempt so the UI returns to idle.
				dropAttempt(key);
				return;
			}
			fail(key, err, programId);
			return;
		}

		// ─── broadcasting → confirming ────────────────────────────────────
		setPhase(key, { phase: 'broadcasting', signature });
		// Flush the `broadcasting` phase to the UI before transitioning.
		// Svelte runes batch synchronous state mutations, so without an
		// explicit `tick()` boundary the broadcasting state would never be
		// observable (the FSM would jump straight from awaiting-signature
		// to confirming). Mirrors `claim.svelte.ts`.
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
		// Refresh portfolio so the UI reflects the new fee-share snapshot
		// + payout balances immediately. WS would also fire, but explicit
		// refresh closes the loop deterministically.
		void lpPortfolio.refresh();
		scheduleCleanup(key);
	} catch (err) {
		// Catch-all for unexpected exceptions during preparing (RPC errors,
		// SDK throws on bad ATA derivation, etc.).
		fail(key, err, programId);
	}
}

function start(row: HolderLpRow | null): Promise<void> {
	// Defensive null-guard: the page button's template guard
	// (`{#if selectedLpRow && hasClaimableFees(selectedLpRow)}`) is only
	// checked at render time. If `lpRows` mutates between render and the
	// click microtask (wallet switch, WS-driven snapshot replacement),
	// `selectedLpRow` may be null when the closure executes. Quietly no-op.
	if (row === null) return Promise.resolve();

	const key = row.positionAddress.toBase58();

	// Single-flight: drop duplicate clicks for the same position.
	const existing = attempts.get(key);
	if (existing && existing.phase !== 'success' && existing.phase !== 'error') {
		return Promise.resolve();
	}

	// Pre-flight: nothing to claim. Defensive — the page button is also
	// disabled in this state.
	if (hasNothingToClaim(row)) {
		toast.warning('Nothing to claim from this position.', { title: 'No fees available' });
		return Promise.resolve();
	}

	// If we have a stale terminal attempt for this key (success or error
	// past cleanup), replace it instead of clinging to it. Cancel its
	// pending cleanup so we don't accidentally drop the new attempt.
	if (existing) {
		const timer = cleanupTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			cleanupTimers.delete(key);
		}
	}

	attempts.set(key, {
		positionAddressBase58: key,
		poolAddressBase58: row.poolAddress.toBase58(),
		phase: 'preparing',
		signature: null,
		error: null,
		startedAt: Date.now()
	});

	return runClaim(row);
}

function isInFlight(positionAddress: PublicKey): boolean {
	const a = attempts.get(positionAddress.toBase58());
	if (!a) return false;
	return a.phase !== 'success' && a.phase !== 'error';
}

export const lpClaims = {
	get attempts(): ReadonlyMap<string, LpClaimAttempt> {
		return attempts;
	},
	isInFlight,
	start
};
