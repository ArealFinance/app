<script lang="ts">
	import { Modal } from '$lib/components/ui';
	import { Xmark } from '$lib/icons';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import { isPhantomInstalled, isSolflareInstalled } from '$lib/wallet';
	import { auth } from '$lib/auth';

	const open = $derived(walletDialog.mode === 'connect');
	const status = $derived(wallet.status);
	const isAwaiting = $derived(status === 'awaiting-signature');

	// Re-check provider availability whenever the dialog opens — the wallet
	// extension may have been installed in another tab while this app was idle.
	let phantomAvailable = $state(false);
	let solflareAvailable = $state(false);
	$effect(() => {
		if (open) {
			phantomAvailable = isPhantomInstalled();
			solflareAvailable = isSolflareInstalled();
		}
	});

	// Auto-close once the mock connection settles, and route the user to the
	// transaction panel so they see what happened.
	$effect(() => {
		if (status === 'connected' && walletDialog.mode === 'connect') {
			walletDialog.open('panel');
		}
	});

	/**
	 * Auto-chain `auth.signIn()` after a USER-INITIATED connect.
	 *
	 * Without this, the flow lands the user in "wallet connected but auth
	 * signed-out" state, which renders an extra "Sign in" button in the header
	 * — non-technical users read that as a bug ("I just connected, why do I
	 * have to sign in?"). Fire-and-forget the signIn handshake immediately so
	 * the wallet's two popups (connection approve + login signature) appear
	 * back-to-back as one continuous flow.
	 *
	 * Guards:
	 *   - only fire on user-initiated connect (this handler), NOT on the
	 *     auto-reconnect path that runs on page load. Page-refresh rehydrates
	 *     auth from sessionStorage; if there's a valid token, status is
	 *     already `signed-in` and the header is clean.
	 *   - skip if auth is already settled for this wallet (defensive — should
	 *     not happen here since the wallet just changed, but keeps idempotent).
	 *   - if the user dismisses the signature in the wallet, auth lands in
	 *     `error` state and the header's "Sign in" button reappears as a
	 *     recovery affordance — that's intentional, not a regression.
	 */
	async function chainSignInAfterConnect() {
		if (!wallet.isConnected) return;
		if (auth.isSignedInForCurrentWallet) return;
		try {
			await auth.signIn();
		} catch {
			// Errors are surfaced via `auth.status === 'error'` + `auth.error`;
			// no need to re-throw or render a toast here.
		}
	}

	async function handleConnectPhantom() {
		if (isAwaiting) return;
		await wallet.connect('phantom');
		await chainSignInAfterConnect();
	}

	async function handleConnectSolflare() {
		if (isAwaiting) return;
		await wallet.connect('solflare');
		await chainSignInAfterConnect();
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

		<img class="wallet-dialog-mark" src="/images/wallet/areal-mark.svg" alt="" aria-hidden="true" loading="lazy" />

		<h2 id="wallet-dialog-title" class="wallet-dialog-title">Connect your wallet</h2>

		<p class="wallet-dialog-help">
			<span>No supported wallets detected. Install</span>
			<span class="wallet-dialog-help-line">
				<img src="/images/wallet/phantom.svg" alt="" aria-hidden="true" loading="lazy" />
				<strong>Phantom</strong>
				<span>or</span>
				<img src="/images/wallet/solflare.svg" alt="" aria-hidden="true" loading="lazy" />
				<strong>Solflare</strong>
			</span>
		</p>

		<div class="wallet-dialog-actions">
			<button
				type="button"
				class="wallet-dialog-cta"
				onclick={handleConnectPhantom}
				disabled={isAwaiting || !phantomAvailable}
				title={phantomAvailable ? undefined : 'Phantom is not installed'}
			>
				<img src="/images/wallet/phantom.svg" alt="" aria-hidden="true" loading="lazy" />
				<span>Connect Phantom</span>
			</button>
			<button
				type="button"
				class="wallet-dialog-cta wallet-dialog-cta--secondary"
				onclick={handleConnectSolflare}
				disabled={isAwaiting || !solflareAvailable}
				title={solflareAvailable ? undefined : 'Solflare is not installed'}
			>
				<img src="/images/wallet/solflare.svg" alt="" aria-hidden="true" loading="lazy" />
				<span>Connect Solflare</span>
			</button>
		</div>

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
		/* Figma: caption at (32, 26), Areal mark at (32, 69). Side gutter 32 = space-8.
		 * No min-height — content drives height so the 'imbalance' below the CTA
		 * disappears when the awaiting-signature pill is hidden. */
		padding: 26px 32px 24px;
		background-color: var(--color-surface); /* #080A0F */
		border-radius: var(--radius-xl); /* 20 */
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	/* Figma-exported blur composite. screen blend lifts the bright pink-purple
	 * bloom off the dark card surface without overpainting the upper portion. */
	.wallet-dialog-aurora {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: url('/images/wallet/dialog-blur.png');
		background-image: image-set(
			url('/images/wallet/dialog-blur.avif') type('image/avif'),
			url('/images/wallet/dialog-blur.webp') type('image/webp'),
			url('/images/wallet/dialog-blur.png') type('image/png')
		);
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		mix-blend-mode: screen;
		opacity: 0.7;
	}

	/* Lift everything above the aurora layer EXCEPT the close button — it sets
	 * its own position: absolute and giving it a `position: relative` here would
	 * override that and drop it back into the flex flow. */
	.wallet-dialog > :not(.wallet-dialog-aurora):not(.wallet-dialog-close) {
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
		/* Figma gap: caption baseline ~26+15=41, mark top ~69 → ~28px to mark. */
		margin-bottom: 28px;
	}

	.wallet-dialog-close {
		position: absolute;
		top: 19px;
		right: 19px;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: transparent;
		border: 0;
		padding: 0;
		color: var(--color-text);
		border-radius: var(--radius-sm);
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
		margin-bottom: var(--space-6);
	}

	.wallet-dialog-title {
		margin: 0 0 var(--space-6);
		font-family: var(--font-sans);
		font-size: var(--text-xl); /* 24 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-snug); /* 1.2 */
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	/* Figma stacks the helper text on TWO rows: copy first, then the
	 * Phantom/Solflare line with brand glyphs. flex-column achieves that
	 * without forcing inline spans into the same row. */
	.wallet-dialog-help {
		/* Per Figma: helper bottom at ~241, CTA top at 273 → 32px gap. */
		margin: 0 0 32px;
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: -0.4px;
		color: var(--color-text);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.wallet-dialog-help-line {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.wallet-dialog-help-line strong {
		font-weight: var(--font-weight-bold);
	}
	.wallet-dialog-help-line img {
		width: 18px;
		height: 18px;
		object-fit: contain;
	}

	/* Two stacked CTAs (Phantom primary, Solflare secondary). Stack vertically
	 * with a small gap so the dialog still reads as a single column on mobile. */
	.wallet-dialog-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* White CTA — Halvar Bold 14 dark, 20-radius. Flows right after the helper
	 * text via that block's 32px margin-bottom; we don't push it to the bottom
	 * edge anymore (caused the 'big empty gap' imbalance). */
	.wallet-dialog-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
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
		cursor: not-allowed;
	}
	.wallet-dialog-cta img {
		width: 20px;
		height: 20px;
		object-fit: contain;
	}

	/* Secondary CTA — translucent fill that lets the aurora bleed through, so
	 * Phantom remains the visually-promoted action. */
	.wallet-dialog-cta--secondary {
		background-color: rgba(255, 255, 255, 0.08);
		color: var(--color-text);
		border: 1px solid rgba(255, 255, 255, 0.12);
	}
	.wallet-dialog-cta--secondary:hover:not(:disabled) {
		background-color: rgba(255, 255, 255, 0.14);
	}

	.wallet-dialog-status {
		align-self: center;
		margin-top: 18px;
		padding: 6px 10px 5px;
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
