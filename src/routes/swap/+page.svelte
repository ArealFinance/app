<script lang="ts">
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import { Button, toast } from '$lib/components/ui';
	import {
		AngleDownSmall,
		ArrowUpDownSimple,
		Gear,
		Check,
		ThumbsUp,
		Clock,
		Bolt
	} from '$lib/icons';

	let fromAmount = $state('');
	let toAmount = $state('');

	const features = [
		{ icon: Check, label: 'Best rates across all liquidity pools' },
		{ icon: ThumbsUp, label: 'Low 0.5% trading fee' },
		{ icon: Bolt, label: 'Instant swaps on Solana blockchain' },
		{ icon: Clock, label: 'No registration or KYC required' }
	];
</script>

<svelte:head>
	<title>Swap · Areal</title>
	<meta name="description" content="Exchange tokens at the best rates on Solana." />
</svelte:head>

<AppShell currentPath="/swap">
	<div class="swap-page">
		<h1 class="swap-headline">Exchange tokens at the best rates</h1>

		<section class="swap-card" aria-labelledby="swap-card-title">
			<header class="swap-card-head">
				<h2 id="swap-card-title" class="swap-card-title">Swap tokens</h2>
				<button class="swap-settings" type="button" aria-label="Swap settings">
					<Gear size={16} variant="duotone" />
				</button>
			</header>

			<div class="swap-stack">
				<div class="swap-row">
					<button type="button" class="swap-token-chip">
						<span class="swap-token-logo" style:background-color="#4265FF">
							<span class="swap-token-mark">S</span>
						</span>
						<span class="swap-token-meta">
							<span class="swap-token-side">From</span>
							<span class="swap-token-symbol">SPRK</span>
						</span>
						<AngleDownSmall size={16} />
					</button>
					<input
						class="swap-amount"
						type="text"
						inputmode="decimal"
						placeholder="0.00"
						bind:value={fromAmount}
						aria-label="Amount to swap from"
					/>
				</div>

				<div class="swap-row">
					<button type="button" class="swap-token-chip">
						<span class="swap-token-logo" style:background-color="#009393">
							<img src="/images/tokens/usdt-t.svg" alt="" aria-hidden="true" />
						</span>
						<span class="swap-token-meta">
							<span class="swap-token-side">To</span>
							<span class="swap-token-symbol">USDt</span>
						</span>
						<AngleDownSmall size={16} />
					</button>
					<input
						class="swap-amount"
						type="text"
						inputmode="decimal"
						placeholder="0.00"
						bind:value={toAmount}
						aria-label="Amount to receive"
					/>
				</div>

				<button class="swap-toggle" type="button" aria-label="Swap from and to">
					<span class="swap-toggle-outer" aria-hidden="true"></span>
					<span class="swap-toggle-inner" aria-hidden="true"></span>
					<span class="swap-toggle-icon">
						<ArrowUpDownSimple size={16} />
					</span>
				</button>
			</div>

			<Button variant="inverse" full onclick={() => toast.info('Wallet connect — TBD')}>
				Connect Wallet
			</Button>
		</section>

		<section class="dex-card" aria-labelledby="dex-card-title">
			<div class="dex-aurora" aria-hidden="true"></div>
			<h3 id="dex-card-title" class="dex-title">Why use our DEX?</h3>
			<ul class="dex-grid">
				{#each features as f}
					{@const Icon = f.icon}
					<li class="dex-item">
						<span class="dex-item-icon">
							<Icon size={24} variant="filled" />
						</span>
						<span class="dex-item-label">{f.label}</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</AppShell>

<style>
	.swap-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-8) var(--space-4);
	}

	/* Hero headline. Halvar Bold 24, uppercase, max width keeps the line break
	 * Figma intends ("Exchange tokens at the / best rates"). */
	.swap-headline {
		margin: 0 0 var(--space-2);
		max-width: 371px;
		font-family: var(--font-sans);
		font-size: var(--text-xl); /* 24 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-snug); /* 1.2 */
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		text-align: center;
	}

	/* ---------- Swap card ---------- */
	.swap-card {
		position: relative;
		width: 100%;
		max-width: 500px;
		padding: var(--space-4);
		background-color: var(--color-surface-inset); /* #181A29 */
		border-radius: var(--radius-xl); /* 24 */
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.swap-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
	}

	.swap-card-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-md); /* 16 */
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.swap-settings {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-bg); /* #070C1C — deeper than card */
		color: var(--color-text);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.swap-settings:hover {
		background-color: var(--color-dark-700);
	}

	/* From / To row container — bg one shade darker than the card so it nests visually. */
	.swap-row {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		background-color: var(--color-bg); /* #070C1C */
		border-radius: var(--radius-lg);
	}

	.swap-token-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-surface-inset); /* #181A29 — back up to card shade */
		border-radius: var(--radius-md);
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.swap-token-chip:hover {
		background-color: var(--color-dark-700);
		filter: brightness(1.1);
	}

	.swap-token-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 12px;
		flex-shrink: 0;
		overflow: hidden;
	}
	.swap-token-logo img {
		width: 60%;
		height: 60%;
		object-fit: contain;
	}
	.swap-token-mark {
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: var(--font-weight-bold);
		color: var(--color-white-900);
		line-height: 1;
	}

	.swap-token-meta {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.2;
	}
	.swap-token-side {
		font-family: 'Onest', var(--font-body);
		font-size: 11px;
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}
	.swap-token-symbol {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.swap-amount {
		width: 100%;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: none;
		padding: 0 var(--space-2);
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		text-align: right;
		color: var(--color-text);
	}
	.swap-amount::placeholder {
		color: var(--color-text-muted);
	}

	/* Wraps the From row + To row so the swap toggle can absolutely-position
	 * itself at the centre of the stack regardless of row content height. */
	.swap-stack {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	/* Toggle button — Figma builds this as two rotated rects. The outer rotated
	 * 45deg gives the diamond outline, the inner rotated -45deg sits as a
	 * normal-looking square on top of it. */
	.swap-toggle {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 36px;
		height: 36px;
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
		z-index: 1;
	}

	.swap-toggle-outer {
		position: absolute;
		inset: 0;
		background-color: var(--color-bg); /* #070C1C */
		border-radius: 12px;
		transform: rotate(45deg);
	}
	.swap-toggle-inner {
		position: absolute;
		inset: 6px;
		background-color: var(--color-surface-inset); /* #181A29 */
		border-radius: 8px;
		transform: rotate(-45deg);
	}
	.swap-toggle-icon {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text);
	}

	/* ---------- Why use our DEX? card ---------- */
	.dex-card {
		position: relative;
		width: 100%;
		max-width: 500px;
		padding: var(--space-4) var(--space-5);
		background-color: var(--color-surface); /* #080A0F */
		border-radius: var(--radius-lg); /* 20 */
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Approximation of the Figma multi-blur composite — radial purple bloom anchored
	 * to the right side of the card. The full Figma stack has 11 layers with mix-blend
	 * exclusion + plus-lighter that we can't replicate in pure CSS; this captures the
	 * dominant visible vibe (right-side purple/blue glow). */
	.dex-aurora {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			radial-gradient(ellipse 60% 80% at 100% 60%, rgba(201, 119, 255, 0.45) 0%, transparent 70%),
			radial-gradient(ellipse 40% 60% at 90% 40%, rgba(26, 0, 255, 0.3) 0%, transparent 70%),
			radial-gradient(ellipse 50% 70% at 65% 80%, rgba(89, 79, 208, 0.25) 0%, transparent 70%);
	}

	.dex-title,
	.dex-grid {
		position: relative;
		z-index: 1;
	}

	.dex-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg); /* 18 */
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.dex-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3);
	}

	.dex-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.dex-item-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		color: var(--color-text);
	}

	.dex-item-label {
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-semibold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-snug);
		color: var(--color-text);
	}

	@media (max-width: 768px) {
		.swap-page {
			padding: var(--space-6) var(--space-4);
		}
		.dex-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: var(--space-4);
		}
	}
</style>
