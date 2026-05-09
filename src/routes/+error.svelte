<script lang="ts">
	import { page } from '$app/state';
	import { Button, Picture } from '$lib/components/ui';
	import Logo from '$lib/components/sections/Logo.svelte';

	const isNotFound = $derived(page.status === 404);
	const headline = $derived(isNotFound ? 'Page not found' : `Error ${page.status}`);

	// 404 macet has only the top aurora — disable body's footer-bg while mounted.
	$effect(() => {
		document.body.classList.add('route-error');
		return () => document.body.classList.remove('route-error');
	});
</script>

<svelte:head>
	<title>{headline} · Areal</title>
</svelte:head>

<div class="error-page">
	<div class="error-content">
		<header class="error-top">
			<Logo height={27} />
		</header>

		<main class="error-main">
			<Picture
				class="error-hero"
				src="/images/404/hero.png"
				alt="404"
				width={983}
				height={964}
				loading="eager"
				fetchpriority="high"
			/>

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
				<Button variant="outline" href="https://x.com/Areal_Finance" rel="noopener noreferrer" target="_blank">
					{#snippet iconLeft()}
						<img class="error-btn-icon error-btn-icon-x" src="/images/404/x-logo.svg" alt="" aria-hidden="true" />
					{/snippet}
					Follow on X
				</Button>
			</div>
		</main>

		<footer class="error-bottom">
			<p class="error-copy">2026 © Areal Protocol. All Rights Reserved</p>
		</footer>
	</div>
</div>

<style>
	.error-page {
		position: relative;
		height: 100dvh;
		display: flex;
		justify-content: center;
		overflow: hidden;
	}

	/* 3-row grid (top / middle / bottom) so logo pins to the top, copyright pins
	 * to the bottom, and the hero block centres in whatever's left. The middle
	 * row is min-height: 0 to allow the hero img to shrink. */
	.error-content {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: var(--container-max);
		height: 100%;
		padding: var(--space-6) var(--space-4);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		justify-items: center;
		gap: var(--space-4);
	}

	.error-top {
		display: flex;
		justify-content: center;
	}

	.error-main {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		min-height: 0;
	}

	.error-bottom {
		display: flex;
		justify-content: center;
	}

	/* Hero composite (crystal + 4·4) — width capped at 482px (Figma) AND height
	 * capped at 45% of the viewport so it always leaves room for the title /
	 * description / CTAs underneath. The img keeps its 983:964 aspect ratio
	 * automatically because both width and height are auto. The :global() lift
	 * is needed because <Picture> wraps the <img> in <picture display:contents>
	 * which puts the class-bearing <img> outside the route's scoped CSS reach. */
	:global(.error-hero) {
		display: block;
		width: auto;
		height: auto;
		max-width: min(482px, 100%);
		max-height: 45vh;
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
		margin-top: var(--space-2);
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
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
		text-align: center;
	}

	/* Short viewports (laptops, landscape mobile): drop the hero further so the
	 * CTAs never get pushed below the fold. */
	@media (max-height: 720px) {
		:global(.error-hero) {
			max-height: 38vh;
		}
		.error-content {
			padding: var(--space-4) var(--space-4);
			gap: var(--space-3);
		}
	}

	@media (max-width: 768px) {
		.error-actions :global(.btn) {
			width: 100%;
			max-width: 245px;
		}
		.error-desc {
			max-width: 320px;
		}
	}
</style>
