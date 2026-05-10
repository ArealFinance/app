<script lang="ts" module>
	export type SwapConfirmModalProps = {
		open?: boolean;
		onclose?: () => void;
		onconfirm?: () => void;
		intent?: SwapIntent | null;
		attempt?: SwapAttempt | null;
	};
</script>

<script lang="ts">
	/*
	 * Modal that walks the holder through one Swap attempt.
	 *
	 * 7 distinct states keyed off `attempt?.phase` (or `null` for the
	 * pre-confirm idle state):
	 *   1. idle pre-confirm    — quote breakdown + Confirm Swap / Cancel
	 *   2. preparing           — spinner ("Re-quoting against fresh reserves…")
	 *   3. awaiting-signature  — wallet icon + "Confirm in your wallet…"
	 *   4. broadcasting        — spinner ("Broadcasting…")
	 *   5. confirming          — sig truncated + "Confirming on-chain…"
	 *   6. success             — green check + "Swap complete!", auto-dismiss 3s
	 *   7. error               — red icon + message + Dismiss
	 *
	 * Backdrop close is DISABLED while a tx is in-flight (phases 3-5) — same
	 * policy as the claim modal.
	 */
	import { Modal } from '$lib/components/ui';
	import { Check, WalletSimple, XmarkCircle } from '$lib/icons';
	import { formatTokenAmount } from '$lib/portfolio/format';
	import type { SwapAttempt, SwapIntent } from '$lib/swap';

	let {
		open = false,
		onclose = () => {},
		onconfirm = () => {},
		intent = null,
		attempt = null
	}: SwapConfirmModalProps = $props();

	const BLOCKING_PHASES = new Set<SwapAttempt['phase']>([
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

	const fromDecimals = $derived(
		intent
			? intent.aToB
				? intent.poolEntry.decimalsA
				: intent.poolEntry.decimalsB
			: 6
	);
	const toDecimals = $derived(
		intent
			? intent.aToB
				? intent.poolEntry.decimalsB
				: intent.poolEntry.decimalsA
			: 6
	);
	const fromSymbol = $derived(
		intent
			? intent.aToB
				? intent.poolEntry.symbolA
				: intent.poolEntry.symbolB
			: ''
	);
	const toSymbol = $derived(
		intent
			? intent.aToB
				? intent.poolEntry.symbolB
				: intent.poolEntry.symbolA
			: ''
	);

	const amountInDisplay = $derived(
		intent ? formatTokenAmount(intent.amountIn, fromDecimals, fromDecimals) : '0'
	);
	const expectedOutDisplay = $derived(
		intent ? formatTokenAmount(intent.expectedOut, toDecimals, toDecimals) : '0'
	);
	const minOutDisplay = $derived(
		intent ? formatTokenAmount(intent.minAmountOut, toDecimals, toDecimals) : '0'
	);
	const slippagePct = $derived(intent ? (intent.slippageBps / 100).toFixed(2) : '0');
	const priceImpactPct = $derived(
		intent ? (intent.priceImpactBps / 100).toFixed(2) : '0'
	);
	// Highlight in danger color when impact exceeds 1% — common DEX UX.
	const priceImpactHigh = $derived(
		intent !== null && Math.abs(intent.priceImpactBps) > 100
	);
	// `feeBps` not directly on intent; surface the raw lamports breakdown.
	// Total fee in lamports of the RWT side.
	const feeTotalDisplay = $derived(
		intent ? formatTokenAmount(intent.fees.feeTotal, toDecimals, toDecimals) : '0'
	);
</script>

<Modal
	{open}
	onclose={blocking ? () => {} : onclose}
	closeOnBackdrop={!blocking}
	aria-labelledby="swap-modal-title"
>
	<div class="swap-modal" role="document">
		{#if attempt === null}
			<!-- ───────── State 1: idle pre-confirm ───────── -->
			<header class="modal-head">
				<h2 id="swap-modal-title" class="modal-title">Confirm swap</h2>
				{#if intent}
					<p class="modal-sub">
						You are swapping <strong class="modal-amount"
							>{amountInDisplay} {fromSymbol}</strong
						>
						for <strong class="modal-amount"
							>~{expectedOutDisplay} {toSymbol}</strong
						>.
					</p>
				{/if}
			</header>

			{#if intent}
				<dl class="quote-grid">
					<div class="quote-row">
						<dt>You pay</dt>
						<dd>{amountInDisplay} {fromSymbol}</dd>
					</div>
					<div class="quote-row">
						<dt>You receive (estimated)</dt>
						<dd>{expectedOutDisplay} {toSymbol}</dd>
					</div>
					<div class="quote-row">
						<dt>Minimum received</dt>
						<dd>{minOutDisplay} {toSymbol} <span class="muted">({slippagePct}% slip.)</span></dd>
					</div>
					<div class="quote-row">
						<dt>Price impact</dt>
						<dd class:price-impact-high={priceImpactHigh}>{priceImpactPct}%</dd>
					</div>
					<div class="quote-row">
						<dt>Fee</dt>
						<dd class="muted">{feeTotalDisplay} {toSymbol}</dd>
					</div>
				</dl>
			{/if}

			<div class="modal-actions">
				<button type="button" class="btn btn-ghost" onclick={onclose}>Cancel</button>
				<button type="button" class="btn btn-primary" onclick={onconfirm}>
					<WalletSimple size={18} />
					<span>Confirm Swap</span>
				</button>
			</div>
		{:else if attempt.phase === 'preparing'}
			<!-- ───────── State 2: preparing ───────── -->
			<div class="modal-status">
				<div class="spinner" aria-label="Loading"></div>
				<p class="modal-status-title">Preparing transaction…</p>
				<p class="modal-status-sub">Re-quoting against fresh reserves.</p>
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
				<p class="modal-status-title">Swap complete!</p>
				<p class="modal-status-sub">Tokens have landed in your wallet.</p>
			</div>
		{:else if attempt.phase === 'error'}
			<!-- ───────── State 7: error ───────── -->
			<div class="modal-status">
				<div class="status-icon status-icon-error">
					<XmarkCircle size={32} />
				</div>
				<p class="modal-status-title">Swap failed</p>
				<p class="modal-status-sub">{attempt.error ?? 'Something went wrong.'}</p>
				<div class="modal-actions modal-actions-single">
					<button type="button" class="btn btn-ghost" onclick={onclose}>Dismiss</button>
				</div>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.swap-modal {
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
	.price-impact-high {
		color: var(--color-danger);
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
		background-color: rgba(255, 255, 255, 0.04);
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
