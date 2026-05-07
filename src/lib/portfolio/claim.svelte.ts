/*
 * Claims service — runes-based singleton.
 *
 * Phase 7 introduces the first WRITE-path: holder-signed RWT claim against
 * a published Merkle root. The service owns the FSM that takes a
 * `PortfolioRow` from "user clicked Claim" through wallet signature, RPC
 * broadcast, and on-chain confirmation, and surfaces phase progression to
 * the UI.
 *
 * Public surface:
 *   claims.{attempts, isInFlight(otMint), start(row)}
 *
 * Lifecycle (per attempt, keyed by `otMint.toBase58()`):
 *
 *   ┌─ none ──────────────────────────────────────────────────┐
 *   │  start(row) & valid           → preparing               │
 *   │  start(row) & in-flight       → no-op (single-flight)   │
 *   │  start(row) & claimableNow=0  → error (terminal)        │
 *   │  start(row) & no proof        → error (terminal)        │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  preparing  → awaiting-signature                        │
 *   │  awaiting-signature                                     │
 *   │      wallet returns sig       → broadcasting            │
 *   │      user rejected (4001)     → drop attempt (silent)   │
 *   │      other wallet error       → error (terminal)        │
 *   │  broadcasting → confirming                              │
 *   │  confirming                                             │
 *   │      confirmed                → success (auto-clean 3s) │
 *   │      tx error                 → error (terminal)        │
 *   │      90s timeout              → error (timeout msg)     │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Error / success terminal phases auto-clean after 3s so the UI can rerun
 * a Claim from the same row without manual reset.
 *
 * Side-effects:
 *   - On `success` we call `portfolio.refresh()` to pick up the new
 *     ClaimStatus + ATA balance immediately. The portfolio store's WS
 *     subscription would also fire, but a direct refresh closes the loop
 *     faster (and is correct even if the WS is mid-reconnect).
 *   - User rejections (Phantom emits the canonical "User rejected the
 *     request" string; Solflare matches with code 4001) are dropped
 *     silently — no toast, no error state. Mirrors the wallet-connect
 *     flow's policy: declining a prompt isn't a failure.
 *
 * Critical correctness invariants:
 *
 *   1. SINGLE-FLIGHT. Only one in-flight attempt per OT mint. A second
 *      `start(row)` for the same OT while the first is mid-flow is a no-op
 *      (NOT an error — duplicate clicks happen). Different OTs run
 *      concurrently.
 *
 *   2. PROOF VALIDATION. `proof.cumulativeAmount` is an unvalidated string
 *      from the proof-store. Re-validate with regex before passing to
 *      `BigInt(...)` (R-G). The SDK's snapshot.ts validates at fetch time,
 *      but the safe path here is to be paranoid at every boundary.
 *
 *   3. PROOF VS DISTRIBUTOR EPOCH. The proof is fetched fresh per claim,
 *      not reused from the portfolio snapshot. Stale snapshots can carry
 *      a proof from epoch N-1 while the on-chain root is at epoch N — a
 *      submitted tx would revert with InvalidProof. Fresh fetch closes
 *      the gap (proof-store always serves the latest published epoch).
 *
 *   4. 90s TIMEOUT. RPCs occasionally hang well past Solana's 60s
 *      blockhash validity. We bound the confirm step at 90s and surface a
 *      "still pending" message — the user should check their wallet
 *      history rather than retry blindly (a duplicate broadcast can land
 *      on a different node and double-claim... no, actually, ClaimStatus
 *      is per-(distributor, claimant) PDA, so the second tx fails with a
 *      "claim status already initialized" error. Still, the right UX is
 *      to tell the user to wait.)
 */
import {
	Connection,
	type PublicKey,
	type Transaction
} from '@solana/web3.js';

import { buildClaimTx } from '@areal/sdk/tx';
import { fetchMerkleProof } from '@areal/sdk/portfolio';
import { RWT_MINTS } from '@areal/sdk/network';
import { parseMerkleDistributor } from '@areal/sdk/yield-distribution';
import type { PortfolioRow } from '@areal/sdk/portfolio';
import { env as publicEnv } from '$env/dynamic/public';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';
import { portfolio } from '$lib/portfolio/store.svelte';
import { showError } from '$lib/errors';
import { toast } from '$lib/components/ui';

export type ClaimPhase =
	| 'preparing'
	| 'awaiting-signature'
	| 'broadcasting'
	| 'confirming'
	| 'success'
	| 'error';

export interface ClaimAttempt {
	otMintBase58: string;
	phase: ClaimPhase;
	/** claimableNow at the moment `start()` was called. */
	amount: bigint;
	signature: string | null;
	error: string | null;
	startedAt: number;
}

const CONFIRM_TIMEOUT_MS = 90_000;
const TERMINAL_CLEANUP_MS = 3_000;

/** Decimal-string regex — proof.cumulativeAmount must match before BigInt. */
const DECIMAL_RE = /^\d+$/;

const attempts = $state(new Map<string, ClaimAttempt>());

/** Per-attempt cleanup timers, keyed by otMintBase58. */
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

function setPhase(key: string, patch: Partial<ClaimAttempt>) {
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

async function runClaim(row: PortfolioRow): Promise<void> {
	const key = row.otMint.toBase58();
	const programId = network.endpoint.programIds.yieldDistribution;

	// Pre-flight 1: distributor must exist (no MerkleDistributor → nothing
	// has been published for this OT).
	if (!row.distributor) {
		setPhase(key, { phase: 'error', error: 'No active distributor for this token.' });
		toast.error('No active distributor for this token.', { title: 'Cannot claim' });
		scheduleCleanup(key);
		return;
	}

	// Pre-flight 2: proof-store URL must be configured. Without it we
	// cannot fetch a proof and the holder cannot claim.
	const proofStoreUrl = publicEnv.PUBLIC_PROOF_STORE_URL || undefined;
	if (!proofStoreUrl) {
		setPhase(key, { phase: 'error', error: 'Proof store is not configured.' });
		toast.error('Proof store is not configured.', { title: 'Cannot claim' });
		scheduleCleanup(key);
		return;
	}

	const holder = wallet.publicKey;
	if (!holder) {
		setPhase(key, { phase: 'error', error: 'Wallet not connected.' });
		toast.error('Wallet not connected.', { title: 'Cannot claim' });
		scheduleCleanup(key);
		return;
	}

	const connection = network.connection;

	try {
		// ─── preparing ────────────────────────────────────────────────────
		// Fetch fresh proof + parse the on-chain distributor in parallel.
		// The distributor parse gives us `reward_vault` which the tx builder
		// needs but isn't on PortfolioRow.
		const [proof, distributorInfo] = await Promise.all([
			fetchMerkleProof(proofStoreUrl, row.distributor, holder),
			connection.getAccountInfo(row.distributor)
		]);

		if (proof === null) {
			setPhase(key, {
				phase: 'error',
				error: 'Proof not yet published for this epoch.'
			});
			toast.error('Proof not yet published for this epoch.', {
				title: 'Cannot claim'
			});
			scheduleCleanup(key);
			return;
		}

		if (distributorInfo === null) {
			setPhase(key, {
				phase: 'error',
				error: 'Distributor account not found on-chain.'
			});
			toast.error('Distributor account not found on-chain.', {
				title: 'Cannot claim'
			});
			scheduleCleanup(key);
			return;
		}

		// R-G mitigation: re-validate proof.cumulativeAmount before BigInt.
		// SDK's snapshot.ts already validates at fetch time, but defense in
		// depth — anything could mutate this value in transit.
		if (typeof proof.cumulativeAmount !== 'string' || !DECIMAL_RE.test(proof.cumulativeAmount)) {
			setPhase(key, {
				phase: 'error',
				error: 'Proof cumulative amount is malformed.'
			});
			toast.error('Proof cumulative amount is malformed.', { title: 'Cannot claim' });
			scheduleCleanup(key);
			return;
		}

		// Codegen normalizes snake_case → camelCase and reclassifies
		// pubkey-shaped `array<u8, 32>` fields into `PublicKey` instances
		// via PUBKEY_MERKLEDISTRIBUTOR_FIELDS, so we get a ready-to-use key.
		const distributor = parseMerkleDistributor(distributorInfo.data);
		const rewardVault = distributor.rewardVault;

		const cumulativeAmount = BigInt(proof.cumulativeAmount);
		const rwtMint = RWT_MINTS[network.current];

		const tx: Transaction = await buildClaimTx({
			connection,
			ydProgramId: programId,
			otMint: row.otMint,
			rwtMint,
			claimant: holder,
			rewardVault,
			cumulativeAmount,
			proofHex: proof.proof,
			ensureAta: true
		});

		// Set blockhash + payer before handing to wallet — the wallet
		// providers expect a fully-prepared tx.
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
		// Transition to confirming immediately — broadcasting is observable
		// only as a brief flash (sig is already in flight by the time the
		// wallet returns it).
		setPhase(key, { phase: 'confirming', signature });

		try {
			await confirmWithTimeout(connection, signature, blockhash, lastValidBlockHeight);
		} catch (err) {
			fail(key, err, programId);
			return;
		}

		// ─── success ──────────────────────────────────────────────────────
		setPhase(key, { phase: 'success' });
		// Refresh portfolio so the UI reflects the new claimedAmount /
		// balance immediately. WS would also fire, but explicit refresh
		// closes the loop deterministically.
		void portfolio.refresh();
		scheduleCleanup(key);
	} catch (err) {
		// Catch-all for unexpected exceptions during preparing (RPC errors,
		// SDK throws on bad proof, etc.).
		fail(key, err, programId);
	}
}

function start(row: PortfolioRow): Promise<void> {
	const key = row.otMint.toBase58();

	// Single-flight: drop duplicate clicks for the same OT.
	const existing = attempts.get(key);
	if (existing && existing.phase !== 'success' && existing.phase !== 'error') {
		return Promise.resolve();
	}

	// Pre-flight: claimableNow must be > 0.
	if (row.claimableNow === null || row.claimableNow === 0n) {
		toast.warning('Nothing to claim for this token.', { title: 'No claim available' });
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
		otMintBase58: key,
		phase: 'preparing',
		amount: row.claimableNow,
		signature: null,
		error: null,
		startedAt: Date.now()
	});

	return runClaim(row);
}

function isInFlight(otMint: PublicKey): boolean {
	const a = attempts.get(otMint.toBase58());
	if (!a) return false;
	return a.phase !== 'success' && a.phase !== 'error';
}

export const claims = {
	get attempts(): ReadonlyMap<string, ClaimAttempt> {
		return attempts;
	},
	isInFlight,
	start
};
