<script lang="ts" module>
	export type MintConfirmModalProps = {
		open?: boolean;
		onclose?: () => void;
		onconfirm?: () => void;
		intent?: MintIntent | null;
		attempt?: MintAttempt | null;
	};
</script>

<script lang="ts">
	/*
	 * Modal that walks the holder through one Mint attempt.
	 *
	 * 7 distinct states keyed off `attempt?.phase` (or `null` for the
	 * pre-confirm idle state):
	 *   1. idle pre-confirm    — quote breakdown + Sign in wallet / Cancel
	 *   2. preparing           — spinner ("Re-pricing against current NAV…")
	 *   3. awaiting-signature  — wallet icon + "Confirm in your wallet…"
	 *   4. broadcasting        — spinner ("Broadcasting…")
	 *   5. confirming          — sig truncated + "Confirming on-chain…"
	 *   6. success             — green check + "Mint complete!", auto-dismiss 3s
	 *   7. error               — red icon + message + Dismiss
	 *
	 * Backdrop close is DISABLED while a tx is in-flight (phases 3-5) — same
	 * policy as the swap and claim modals.
	 *
	 * Phase 10 specifics:
	 *   - Pay row shows USDC (6 decimals fixed).
	 *   - Receive row shows RWT (6 decimals fixed).
	 *   - NAV badge shows "1 RWT = $X.XX" using `intent.navAtQuote`.
	 *   - Fee breakdown splits into vault (NAV-boost) and Areal (DAO) parts.
	 */
	import { Modal } from '$lib/components/ui';
	import { Check, WalletSimple, XmarkCircle } from '$lib/icons';
	import { formatTokenAmount } from '$lib/portfolio/format';
	import type { MintAttempt, MintIntent } from '$lib/mint';

	let {
		open = false,
		onclose = () => {},
		onconfirm = () => {},
		intent = null,
		attempt = null
	}: MintConfirmModalProps = $props();

	const BLOCKING_PHASES = new Set<MintAttempt['phase']>([
		'awaiting-signature',
		'broadcasting',
		'confirming'
	]);

	const blocking = $derived(attempt !== null && BLOCKING_PHASES.has(attempt.phase));

	function truncSig(sig: string): string {
		if (sig.length <= 12) return sig;
		return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
	}

	// Auto-dismiss success after 3s — the FSM drops its attempt at the same
	// moment, so leaving the modal open would render stale data.
	$effect(() => {
		if (!open) return;
		if (attempt?.phase !== 'success') return;
		const t = setTimeout(() => onclose(), 3_000);
		return () => clearTimeout(t);
	});

	// ──────────────────── pre-confirm display ────────────────────────────

	// USDC and RWT are both 6 decimals on every cluster — the rwt-engine
	// pins `vault.rwt_mint` decimals to match `usdc_mint` at deploy time.
	const USDC_DECIMALS = 6;
	const RWT_DECIMALS = 6;

	const amountInDisplay = $derived(
		intent ? formatTokenAmount(intent.amountIn, USDC_DECIMALS, USDC_DECIMALS) : '0'
	);
	const expectedRwtDisplay = $derived(
		intent ? formatTokenAmount(intent.expectedRwt, RWT_DECIMALS, RWT_DECIMALS) : '0'
	);
	const minRwtDisplay = $derived(
		intent ? formatTokenAmount(intent.minRwtOut, RWT_DECIMALS, RWT_DECIMALS) : '0'
	);
	const slippagePct = $derived(intent ? (intent.slippageBps / 100).toFixed(2) : '0');

	// NAV at quote: lamports of USDC per lamport of RWT. Both 6 decimals,
	// so the display is just the same scaling — formatTokenAmount with
	// USDC decimals yields a "$X.XX per RWT" number.
	const navDisplay = $derived(
		intent ? formatTokenAmount(intent.navAtQuote, USDC_DECIMALS, 4) : '0'
	);

	// Fee breakdown — vault and DAO fees are both expressed in net-deposit
	// USDC lamports (6 decimals).
	const feeVaultDisplay = $derived(
		intent ? formatTokenAmount(intent.fees.feeVault, USDC_DECIMALS, USDC_DECIMALS) : '0'
	);
	const feeDaoDisplay = $derived(
		intent ? formatTokenAmount(intent.fees.feeDao, USDC_DECIMALS, USDC_DECIMALS) : '0'
	);
</script>

<Modal
	{open}
	onclose={blocking ? () => {} : onclose}
	closeOnBackdrop={!blocking}
	aria-labelledby="mint-modal-title"
>
	<div class="mint-modal" role="document">
		{#if attempt === null}
			<!-- ───────── State 1: idle pre-confirm ───────── -->
			<header class="modal-head">
				<h2 id="mint-modal-title" class="modal-title">Confirm mint</h2>
				{#if intent}
					<p class="modal-sub">
						You are minting <strong class="modal-amount"
							>~{expectedRwtDisplay} RWT</strong
						>
						for <strong class="modal-amount">{amountInDisplay} USDC</strong>.
					</p>
				{/if}
			</header>

			{#if intent}
				<dl class="quote-grid">
					<div class="quote-row">
						<dt>You pay</dt>
						<dd>{amountInDisplay} USDC</dd>
					</div>
					<div class="quote-row">
						<dt>You receive (estimated)</dt>
						<dd>{expectedRwtDisplay} RWT</dd>
					</div>
					<div class="quote-row">
						<dt>NAV at quote</dt>
						<dd>${navDisplay} <span class="muted">(1 RWT)</span></dd>
					</div>
					<div class="quote-row">
						<dt>Minimum received</dt>
						<dd>
							{minRwtDisplay} RWT <span class="muted">({slippagePct}% slip.)</span>
						</dd>
					</div>
					<div class="quote-row">
						<dt>Vault fee <span class="muted">(NAV boost)</span></dt>
						<dd class="muted">{feeVaultDisplay} USDC</dd>
					</div>
					<div class="quote-row">
						<dt>Areal fee</dt>
						<dd class="muted">{feeDaoDisplay} USDC</dd>
					</div>
				</dl>
			{/if}

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
				<p class="modal-status-sub">Re-pricing against the current NAV.</p>
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
				<p class="modal-status-title">Mint complete!</p>
				<p class="modal-status-sub">RWT has landed in your wallet.</p>
			</div>
		{:else if attempt.phase === 'error'}
			<!-- ───────── State 7: error ───────── -->
			<div class="modal-status">
				<div class="status-icon status-icon-error">
					<XmarkCircle size={32} />
				</div>
				<p class="modal-status-title">Mint failed</p>
				<p class="modal-status-sub">{attempt.error ?? 'Something went wrong.'}</p>
				<div class="modal-actions modal-actions-single">
					<button type="button" class="btn btn-ghost" onclick={onclose}>Dismiss</button>
				</div>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.mint-modal {
		width: min(440px, 100%);
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

	.quote-grid {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.quote-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-sm);
	}
	.quote-row dt {
		margin: 0;
		color: var(--color-text-muted);
	}
	.quote-row dd {
		margin: 0;
		color: var(--color-text);
		font-weight: var(--font-weight-medium);
		text-align: right;
	}
	.quote-row .muted {
		color: var(--color-text-muted);
		font-weight: var(--font-weight-medium);
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
