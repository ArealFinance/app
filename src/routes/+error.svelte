<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui';
	import Logo from '$lib/components/sections/Logo.svelte';

	const isNotFound = $derived(page.status === 404);
	const headline = $derived(isNotFound ? 'Page not found' : `Error ${page.status}`);
</script>

<svelte:head>
	<title>{headline} · Areal</title>
</svelte:head>

<div class="error-page">
	<div class="error-bg" aria-hidden="true"></div>

	<div class="error-content">
		<Logo height={27} />

		<img class="error-hero" src="/images/404/hero.png" alt="404" />

		<h1 class="error-title">{headline}</h1>

		<p class="error-desc">
			Areal is being rebuilt from the ground up — new design, fully on-chain, Solana-native.
			Same vision for yield-bearing RWAs. On mainnet soon.
		</p>

		<div class="error-actions">
			<Button variant="inverse" href="/">
				{#snippet iconLeft()}
					<img class="error-btn-icon" src="/images/404/house-simple.svg" alt="" aria-hidden="true" />
				{/snippet}
				Connect wallet
			</Button>
			<Button variant="outline" href="https://x.com/arealfinance" rel="noopener noreferrer" target="_blank">
				{#snippet iconLeft()}
					<img class="error-btn-icon error-btn-icon-x" src="/images/404/x-logo.svg" alt="" aria-hidden="true" />
				{/snippet}
				Follow on X
			</Button>
		</div>

		<p class="error-copy">2026 © Areal Protocol. All Rights Reserved</p>
	</div>
</div>

<style>
	.error-page {
		position: relative;
		min-height: 100dvh;
		display: flex;
		justify-content: center;
		overflow: hidden;
	}

	/* Decorative purple/blue blur composite — reuses the footer aurora PNG flipped
	 * vertically so the bright bands hover top + bottom of the 404 view. */
	.error-bg {
		position: absolute;
		inset: 0;
		background-image: url('/images/aurora/footer-bg.png');
		background-position: center;
		background-size: cover;
		background-repeat: no-repeat;
		transform: scaleY(-1);
		opacity: 0.9;
		pointer-events: none;
	}

	.error-content {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: var(--container-max);
		min-height: 100dvh;
		padding: var(--space-16) var(--space-4) var(--space-12);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-6);
	}

	/* Single composite (crystal + glow + 4·4 numerals) exported from Figma. */
	.error-hero {
		display: block;
		width: 100%;
		max-width: 482px; /* Figma 481.58 */
		height: auto;
		margin: var(--space-12) 0 var(--space-8);
		pointer-events: none;
		user-select: none;
	}

	.error-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-xl); /* 24 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-snug); /* 1.2 */
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		text-align: center;
	}

	.error-desc {
		margin: 0;
		max-width: 343px;
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: -0.4px;
		text-align: center;
		color: var(--color-text-muted);
	}

	.error-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}

	/* Per Figma both buttons are 245×48 — fixed width keeps the stacked CTAs aligned. */
	.error-actions :global(.btn) {
		width: 245px;
	}

	.error-btn-icon {
		width: 16px;
		height: 16px;
		display: block;
	}

	.error-btn-icon-x {
		width: 16px;
		height: 14px;
	}

	.error-copy {
		margin: auto 0 0;
		padding-top: var(--space-12);
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
		text-align: center;
	}

	@media (max-width: 768px) {
		.error-content {
			padding: var(--space-10) var(--space-4) var(--space-8);
			gap: var(--space-4);
		}
		.error-hero {
			max-width: 320px;
			margin: var(--space-8) 0 var(--space-6);
		}
		.error-actions :global(.btn) {
			width: 100%;
			max-width: 245px;
		}
	}
</style>
