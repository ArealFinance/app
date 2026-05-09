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

	/**
	 * Dialog phases:
	 *
	 *   A: pick — wallet not connected; show provider CTAs.
	 *   B: signing — wallet connected, auth is mid-handshake; show spinner.
	 *   C: needs-sign — wallet connected, auth not signed-in (user dismissed
	 *      the signature popup, or sessionStorage rehydrate left us cold);
	 *      show explanation + "Sign message" retry CTA + "Skip for now".
	 *
	 * Phase D (done) isn't a render state — when `auth` settles to `signed-in`
	 * we auto-close the dialog and route the user to the wallet panel.
	 */
	const phase = $derived.by<'pick' | 'signing' | 'needs-sign'>(() => {
		if (!wallet.isConnected) return 'pick';
		if (auth.status === 'signing' || auth.status === 'authenticating') return 'signing';
		// Wallet connected + auth not in-flight + not signed-in → user needs to
		// finish the second step (sign the login message). Covers post-dismiss
		// (`auth.status === 'error'`) and the rare cold-rehydrate-failure case
		// (`auth.status === 'signed-out' | 'expired'`).
		if (!auth.isSignedInForCurrentWallet) return 'needs-sign';
		// auth.isSignedInForCurrentWallet — Phase D handled by the auto-close
		// effect below.
		return 'pick';
	});

	// Re-check provider availability whenever the dialog opens — the wallet
	// extension may have been installed in another tab while this app was idle.
	let phantomAvailable = $state(false);
	let solflareAvailable = $state(false);
	$effect(() => {
		if (open && phase === 'pick') {
			phantomAvailable = isPhantomInstalled();
			solflareAvailable = isSolflareInstalled();
		}
	});

	/**
	 * Auto-close + route to wallet panel ONLY after the full handshake
	 * (connect + sign-in) is complete. Closing on `wallet.status === 'connected'`
	 * alone (the prior behavior) yanked the modal away while `auth.signIn()`
	 * was still mid-flight — leaving the user staring at a "Sign in" button
	 * in the header with no context.
	 */
	$effect(() => {
		if (
			walletDialog.mode === 'connect' &&
			wallet.isConnected &&
			auth.isSignedInForCurrentWallet
		) {
			walletDialog.open('panel');
		}
	});

	/**
	 * Auto-chain `auth.signIn()` after a USER-INITIATED connect.
	 *
	 * Without this, the flow lands the user in "wallet connected but auth
	 * signed-out" state, which renders an extra "Sign in" button in the header
	 * — non-technical users read that as a bug ("I just connected, why do I
	 * have to sign in?"). Fire the signIn handshake immediately so the wallet's
	 * two popups (connection approve + login signature) appear back-to-back.
	 *
	 * Guards:
	 *   - only fires on user-initiated connect (this handler) and on Phase C
	 *     retry. NOT on the auto-reconnect path that runs on page load —
	 *     sessionStorage rehydrate already lands `signed-in` if a valid token
	 *     exists, and the auth store does not auto-sign on cold boot.
	 *   - skips if `auth.isSignedInForCurrentWallet` (defensive idempotence).
	 *   - if the user dismisses the signature, auth lands in `error` and the
	 *     dialog stays open in Phase C with a clear retry path.
	 */
	async function runSignIn() {
		if (!wallet.isConnected) return;
		if (auth.isSignedInForCurrentWallet) return;
		try {
			await auth.signIn();
		} catch {
			// Surfaced via `auth.status === 'error'` + `auth.error`. The dialog
			// stays in Phase C so the user has an obvious retry button.
		}
	}

	async function handleConnectPhantom() {
		if (isAwaiting) return;
		await wallet.connect('phantom');
		await runSignIn();
	}

	async function handleConnectSolflare() {
		if (isAwaiting) return;
		await wallet.connect('solflare');
		await runSignIn();
	}

	async function handleSkipSignIn() {
		// "Skip for now" disconnects the wallet too — a half-connected state
		// (wallet OK, auth not signed-in) shows nothing in the header, so
		// keeping it around would just be a hidden pubkey the user can't
		// see. Disconnecting returns the app to a clean "Connect Wallet"
		// state; if they want to retry, the same CTA reopens this dialog
		// from Phase A.
		walletDialog.close();
		try {
			await wallet.disconnect();
		} catch {
			// Best-effort — extension may already be detached.
		}
	}

	/**
	 * Closing the dialog from Phase B/C (X button or backdrop click) follows
	 * the same "abandon ship" semantics as Skip for now: disconnect the
	 * wallet so we don't leave a hidden half-state. From Phase A there's
	 * nothing to disconnect, so just close.
	 */
	async function handleClose() {
		const wasMidFlow = phase !== 'pick';
		walletDialog.close();
		if (wasMidFlow) {
			try {
				await wallet.disconnect();
			} catch {
				// Best-effort.
			}
		}
	}
</script>

<Modal {open} onclose={handleClose} aria-labelledby="wallet-dialog-title">
	<div class="wallet-dialog">
		<div class="wallet-dialog-aurora" aria-hidden="true"></div>

		<div class="wallet-dialog-caption">
			{#if phase === 'pick'}Connect wallet{:else}Sign in{/if}
		</div>

		<button
			type="button"
			class="wallet-dialog-close"
			aria-label="Close"
			onclick={handleClose}
		>
			<Xmark size={20} />
		</button>

		<img class="wallet-dialog-mark" src="/images/wallet/areal-mark.svg" alt="" aria-hidden="true" loading="lazy" />

		{#if phase === 'pick'}
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
		{:else if phase === 'signing'}
			<h2 id="wallet-dialog-title" class="wallet-dialog-title">Signing you in</h2>

			<p class="wallet-dialog-help">
				<span>Approve the login message in your wallet to access your portfolio.</span>
				<span>This won't cost any gas — it's just a signature for the session.</span>
			</p>

			<div class="wallet-dialog-spinner-wrap" role="status" aria-live="polite">
				<span class="wallet-dialog-spinner" aria-hidden="true"></span>
				<span class="wallet-dialog-spinner-label">Waiting for signature…</span>
			</div>
		{:else}
			<!-- phase === 'needs-sign' -->
			<h2 id="wallet-dialog-title" class="wallet-dialog-title">One more step</h2>

			<p class="wallet-dialog-help">
				<span>Your wallet is connected. Sign a one-time login message to access your portfolio and on-chain history.</span>
				<span>This won't cost any gas — it's only a signature.</span>
			</p>

			{#if auth.status === 'error' && auth.error}
				<div class="wallet-dialog-banner" role="alert">
					{auth.error}
				</div>
			{/if}

			<div class="wallet-dialog-actions">
				<button
					type="button"
					class="wallet-dialog-cta"
					onclick={runSignIn}
					disabled={auth.status === 'signing' || auth.status === 'authenticating'}
				>
					<span>Sign message</span>
				</button>
				<button
					type="button"
					class="wallet-dialog-cta wallet-dialog-cta--secondary"
					onclick={handleSkipSignIn}
				>
					<span>Skip for now</span>
				</button>
			</div>
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

	/* Phase B (signing) — large spinner + label, occupies the same vertical
	 * space the CTAs would in Phase A so the dialog doesn't jump between
	 * phases. */
	.wallet-dialog-spinner-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		min-height: 108px; /* matches the two stacked CTAs (48 + 48 + 12 gap). */
	}
	.wallet-dialog-spinner {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 2.5px solid rgba(255, 255, 255, 0.18);
		border-top-color: var(--color-purple-300, #c2a3ff);
		animation: wallet-dialog-spin 0.8s linear infinite;
	}
	.wallet-dialog-spinner-label {
		font-family: var(--font-body);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 1px;
		text-transform: uppercase;
		color: var(--color-purple-200);
	}
	@keyframes wallet-dialog-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Phase C (needs-sign) — soft warning banner that surfaces the auth.error
	 * message (e.g. "User rejected the request"). Sits between help copy and
	 * the Sign / Skip CTAs. */
	.wallet-dialog-banner {
		margin-bottom: var(--space-4);
		padding: var(--space-3) var(--space-4);
		background-color: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.32);
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		line-height: var(--leading-normal);
		color: var(--color-text);
	}

	@media (max-width: 480px) {
		.wallet-dialog {
			width: 100%;
			min-height: auto;
			padding: var(--space-5) var(--space-4) var(--space-8);
		}
	}
</style>
