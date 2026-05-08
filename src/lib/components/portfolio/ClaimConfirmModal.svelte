<script lang="ts" module>
	export type ClaimConfirmModalProps = {
		open?: boolean;
		onclose?: () => void;
		onconfirm?: () => void;
		row?: PortfolioRow | null;
		attempt?: ClaimAttempt | null;
	};
</script>

<script lang="ts">
	/*
	 * Modal that walks the holder through one Claim attempt.
	 *
	 * Renders 7 distinct states keyed off `attempt?.phase` (or `null` for the
	 * pre-confirm idle state):
	 *   1. idle pre-confirm     — Sign in wallet / Cancel buttons
	 *   2. preparing            — spinner
	 *   3. awaiting-signature   — wallet icon + "Confirm in your wallet…"
	 *   4. broadcasting         — "Broadcasting…"
	 *   5. confirming           — sig truncated + "Confirming on-chain…"
	 *   6. success              — green check + "Claimed!", auto-dismiss 3s
	 *   7. error                — red icon + message + Dismiss
	 *
	 * Backdrop close is DISABLED while a tx is in-flight (phases 3-5) so a
	 * stray click doesn't lose track of an in-progress claim — the FSM
	 * persists in the claims store, but the modal is the user's primary
	 * status surface.
	 */
	import { Modal } from '$lib/components/ui';
	import { Check, WalletSimple, XmarkCircle } from '$lib/icons';
	import { formatTokenAmount } from '$lib/portfolio/format';
	// RWT_DECIMALS lives on the portfolio store today (R-H follow-up: lift
	// to a runtime mint metadata read). Importing from the canonical source
	// keeps the modal in lock-step with what the page renders.
	import { RWT_DECIMALS } from '$lib/portfolio/store.svelte';
	import type { PortfolioRow } from '@areal/sdk/portfolio';
	import type { ClaimAttempt } from '$lib/portfolio/claim.svelte';

	// Default `row`/`attempt` to `null` (not `undefined`) so the autodocs
	// renderer — which mounts the component with empty props — doesn't crash
	// on `attempt.phase` before story args are wired in.
	let {
		open = false,
		onclose = () => {},
		onconfirm = () => {},
		row = null,
		attempt = null
	}: ClaimConfirmModalProps = $props();

	// Phases where we should NOT allow backdrop dismissal — the user has
	// kicked off a tx and the modal is the visible status surface.
	const BLOCKING_PHASES = new Set<ClaimAttempt['phase']>([
		'awaiting-signature',
		'broadcasting',
		'confirming'
	]);

	const blocking = $derived(attempt !== null && BLOCKING_PHASES.has(attempt.phase));

	// Truncate signature to first-4 + last-4 like a wallet address — gives
	// the user enough to cross-check on Solscan/Solana Explorer without
	// blowing up the layout.
	function truncSig(sig: string): string {
		if (sig.length <= 12) return sig;
		return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
	}

	// Auto-dismiss success after 3s (the claims service drops its attempt at
	// the same moment, so leaving the modal open would show stale data).
	$effect(() => {
		if (!open) return;
		if (attempt?.phase !== 'success') return;
		const t = setTimeout(() => onclose(), 3_000);
		return () => clearTimeout(t);
	});

	const amountDisplay = $derived(
		row ? formatTokenAmount(row.claimableNow ?? 0n, RWT_DECIMALS, RWT_DECIMALS) : '0'
	);
	const symbol = $derived(row?.metadata.symbol ?? '');
</script>

<Modal
	{open}
	onclose={blocking ? () => {} : onclose}
	closeOnBackdrop={!blocking}
	aria-labelledby="claim-modal-title"
>
	<div class="claim-modal" role="document">
		{#if attempt === null}
			<!-- ───────── State 1: idle pre-confirm ───────── -->
			<header class="modal-head">
				<h2 id="claim-modal-title" class="modal-title">Claim rewards</h2>
				<p class="modal-sub">
					You are about to claim
					<strong class="modal-amount">{amountDisplay} RWT</strong>
					{#if symbol}
						from <strong>{symbol}</strong>
					{/if}.
				</p>
			</header>

			<div class="modal-actions">
				<button type="button" class="btn btn-ghost" onclick={onclose}>Cancel</button>
				<button type="button" class="btn btn-primary" onclick={onconfirm}>
					<WalletSimple size={18} />
					<span>Sign in wallet</span>
				</button>
			</div>
		{:else if attempt.phase === 'preparing'}
			<!-- ───────── State 2: preparing ───────── -->
			<div class="modal-status">
				<div class="spinner" aria-label="Loading"></div>
				<p class="modal-status-title">Preparing transaction…</p>
				<p class="modal-status-sub">Fetching proof and building the claim instruction.</p>
			</div>
		{:else if attempt.phase === 'awaiting-signature'}
			<!-- ───────── State 3: awaiting-signature ───────── -->
			<div class="modal-status">
				<div class="status-icon status-icon-neutral">
					<WalletSimple size={32} />
				</div>
				<p class="modal-status-title">Confirm in your wallet…</p>
				<p class="modal-status-sub">Approve the transaction in your wallet to continue.</p>
			</div>
		{:else if attempt.phase === 'broadcasting'}
			<!-- ───────── State 4: broadcasting ───────── -->
			<div class="modal-status">
				<div class="spinner" aria-label="Broadcasting"></div>
				<p class="modal-status-title">Broadcasting…</p>
				<p class="modal-status-sub">Sending your transaction to the cluster.</p>
			</div>
		{:else if attempt.phase === 'confirming'}
			<!-- ───────── State 5: confirming ───────── -->
			<div class="modal-status">
				<div class="spinner" aria-label="Confirming"></div>
				<p class="modal-status-title">Confirming on-chain…</p>
				{#if attempt.signature}
					<p class="modal-status-sub">
						Signature: <code class="sig">{truncSig(attempt.signature)}</code>
					</p>
				{:else}
					<p class="modal-status-sub">Waiting for cluster confirmation.</p>
				{/if}
			</div>
		{:else if attempt.phase === 'success'}
			<!-- ───────── State 6: success ───────── -->
			<div class="modal-status">
				<div class="status-icon status-icon-success">
					<Check size={32} />
				</div>
				<p class="modal-status-title">Claimed!</p>
				<p class="modal-status-sub">Rewards have landed in your wallet.</p>
			</div>
		{:else if attempt.phase === 'error'}
			<!-- ───────── State 7: error ───────── -->
			<div class="modal-status">
				<div class="status-icon status-icon-error">
					<XmarkCircle size={32} />
				</div>
				<p class="modal-status-title">Claim failed</p>
				<p class="modal-status-sub">{attempt.error ?? 'Something went wrong.'}</p>
				<div class="modal-actions modal-actions-single">
					<button type="button" class="btn btn-ghost" onclick={onclose}>Dismiss</button>
				</div>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.claim-modal {
		width: min(420px, 100%);
		padding: var(--space-6);
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.modal-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.modal-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.modal-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-base);
		color: var(--color-text-muted);
	}
	.modal-amount {
		color: var(--color-text);
		font-family: 'Onest', var(--font-body);
		font-weight: var(--font-weight-semibold);
	}

	.modal-actions {
		display: flex;
		gap: var(--space-3);
		justify-content: flex-end;
	}
	.modal-actions-single {
		justify-content: center;
		margin-top: var(--space-4);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		height: 40px;
		padding: 0 var(--space-4);
		border: 0;
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-tight);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.btn-ghost {
		background-color: transparent;
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}
	.btn-ghost:hover {
		background-color: var(--color-hover-tint);
	}
	.btn-primary {
		background-color: var(--color-primary);
		color: var(--color-text);
	}
	.btn-primary:hover {
		filter: brightness(1.08);
	}

	/* ───────────────── Status panes ───────────────── */
	.modal-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4) 0 var(--space-2);
		text-align: center;
	}
	.modal-status-title {
		margin: 0;
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		color: var(--color-text);
	}
	.modal-status-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		max-width: 320px;
	}

	.status-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background-color: var(--color-surface-inset);
	}
	.status-icon-success {
		background-color: var(--color-success-bg-strong);
		color: var(--color-success);
	}
	.status-icon-error {
		background-color: var(--color-danger-bg-strong);
		color: var(--color-danger);
	}
	.status-icon-neutral {
		color: var(--color-text-muted);
	}

	/* CSS-only spinner — no extra deps. */
	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-surface-inset);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.9s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.sig {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-text);
		background-color: var(--color-surface-inset);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
	}
</style>
