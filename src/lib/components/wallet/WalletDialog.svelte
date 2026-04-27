<script lang="ts">
	import { Modal } from '$lib/components/ui';
	import { Xmark } from '$lib/icons';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';

	const open = $derived(walletDialog.mode === 'connect');
	const status = $derived(wallet.status);
	const isAwaiting = $derived(status === 'awaiting-signature');

	// Auto-close once the mock connection settles, and route the user to the
	// transaction panel so they see what happened.
	$effect(() => {
		if (status === 'connected' && walletDialog.mode === 'connect') {
			walletDialog.open('panel');
		}
	});

	function handleSignIn() {
		if (isAwaiting) return;
		wallet.connect('phantom');
	}
</script>

<Modal {open} onclose={() => walletDialog.close()} aria-labelledby="wallet-dialog-title">
	<div class="wallet-dialog">
		<div class="wallet-dialog-aurora" aria-hidden="true"></div>

		<div class="wallet-dialog-caption">Connected via Phantom</div>

		<button
			type="button"
			class="wallet-dialog-close"
			aria-label="Close"
			onclick={() => walletDialog.close()}
		>
			<Xmark size={20} />
		</button>

		<img class="wallet-dialog-mark" src="/images/wallet/areal-mark.svg" alt="" aria-hidden="true" />

		<h2 id="wallet-dialog-title" class="wallet-dialog-title">Connect your wallet</h2>

		<p class="wallet-dialog-help">
			<span>No supported wallets detected. Install</span>
			<span class="wallet-dialog-help-line">
				<img src="/images/wallet/phantom.svg" alt="" aria-hidden="true" />
				<strong>Phantom</strong>
				<span>or</span>
				<img src="/images/wallet/solflare.svg" alt="" aria-hidden="true" />
				<strong>Solflare</strong>
			</span>
		</p>

		<button
			type="button"
			class="wallet-dialog-cta"
			onclick={handleSignIn}
			disabled={isAwaiting}
		>
			Sign in
		</button>

		{#if isAwaiting}
			<div class="wallet-dialog-status" role="status">Waiting for signature</div>
		{/if}
	</div>
</Modal>

<style>
	.wallet-dialog {
		position: relative;
		width: 444px;
		max-width: 100%;
		min-height: 393px;
		padding: var(--space-6) var(--space-6) var(--space-12);
		background-color: var(--color-surface); /* #080A0F */
		border-radius: var(--radius-xl); /* 20 */
		overflow: hidden;
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: auto auto auto auto auto auto;
		gap: 0;
	}

	/* Decorative aurora — single radial bloom anchored to bottom-centre. The full
	 * Figma stack has a 12-layer purple/blue blur composite that we approximate
	 * here; can be swapped for a PNG export if pixel-fidelity becomes important. */
	.wallet-dialog-aurora {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			radial-gradient(ellipse 80% 60% at 30% 110%, rgba(201, 119, 255, 0.65) 0%, transparent 65%),
			radial-gradient(ellipse 70% 50% at 70% 105%, rgba(26, 0, 255, 0.45) 0%, transparent 70%),
			radial-gradient(ellipse 60% 40% at 50% 95%, rgba(89, 79, 208, 0.35) 0%, transparent 70%);
	}

	.wallet-dialog > :not(.wallet-dialog-aurora) {
		position: relative;
		z-index: 1;
	}

	.wallet-dialog-caption {
		font-family: var(--font-body);
		font-size: var(--text-xs); /* 11 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: 1px;
		text-transform: uppercase;
		color: var(--color-purple-200); /* #EADAFF */
		margin-bottom: var(--space-6);
	}

	.wallet-dialog-close {
		position: absolute;
		top: var(--space-4);
		right: var(--space-4);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 0;
		color: var(--color-text);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.wallet-dialog-close:hover {
		background-color: rgba(255, 255, 255, 0.08);
	}

	.wallet-dialog-mark {
		display: block;
		width: 36px;
		height: 36px;
		margin-bottom: var(--space-3);
	}

	.wallet-dialog-title {
		margin: 0 0 var(--space-4);
		font-family: var(--font-sans);
		font-size: var(--text-xl); /* 24 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-snug); /* 1.2 */
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.wallet-dialog-help {
		margin: 0 0 var(--space-5);
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: -0.4px;
		color: var(--color-text);
	}
	.wallet-dialog-help-line {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.wallet-dialog-help-line strong {
		font-weight: var(--font-weight-bold);
	}
	.wallet-dialog-help-line img {
		width: 18px;
		height: 18px;
		object-fit: contain;
	}

	/* White CTA — Halvar Bold 14 dark, 20-radius. Disabled state during the
	 * awaiting-signature phase keeps the visual but prevents double-click. */
	.wallet-dialog-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 48px;
		padding: 0 var(--space-5);
		background-color: var(--color-white-900); /* #FBF2FF */
		color: var(--color-text-inverse); /* #080A0F */
		border: 0;
		border-radius: var(--radius-lg); /* 20 */
		font-family: var(--font-sans);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color var(--motion-base) var(--ease-out),
			opacity var(--motion-base) var(--ease-out);
	}
	.wallet-dialog-cta:hover:not(:disabled) {
		background-color: var(--color-white-800);
	}
	.wallet-dialog-cta:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.wallet-dialog-status {
		justify-self: center;
		margin-top: var(--space-3);
		padding: 6px var(--space-3) 5px;
		min-width: 180px;
		background-color: rgba(0, 0, 0, 0.3);
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 1px;
		text-transform: uppercase;
		color: var(--color-purple-200);
		text-align: center;
	}

	@media (max-width: 480px) {
		.wallet-dialog {
			width: 100%;
			min-height: auto;
			padding: var(--space-5) var(--space-4) var(--space-8);
		}
	}
</style>
