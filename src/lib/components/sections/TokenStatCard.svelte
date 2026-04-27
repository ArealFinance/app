<script lang="ts" module>
	export type TokenStatCardState = 'live' | 'coming-soon';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		symbol: string;
		name: string;
		tvl?: string;
		price?: string;
		delta?: string;
		deltaTone?: 'success' | 'danger';
		period?: string;
		state?: TokenStatCardState;
		href?: string;
		external?: boolean;
		sparklineSrc?: string;
		icon?: Snippet;
	};

	let {
		symbol,
		name,
		tvl,
		price,
		delta,
		deltaTone = 'success',
		period = '24H',
		state = 'live',
		href,
		external = false,
		sparklineSrc = '/images/cards/sparkline-up.svg',
		icon
	}: Props = $props();

	const isComingSoon = $derived(state === 'coming-soon');
	const showLink = $derived(external && href !== undefined);
</script>

<article class="card" class:coming-soon={isComingSoon}>
	{#if showLink}
		<a class="card-go" {href} aria-label="Open {name}">
			<img src="/images/cards/arrow-up-right.svg" alt="" />
		</a>
	{/if}

	<div class="card-head">
		<div class="card-avatar">
			{#if icon}
				{@render icon()}
			{:else}
				<img src="/images/tokens/coming-soon.svg" alt="" />
			{/if}
		</div>

		<div class="card-name-block">
			<div class="card-name">{name}</div>
			<div class="card-meta">
				<span class="chip chip-symbol">{symbol}</span>
				{#if tvl && !isComingSoon}
					<span class="chip chip-tvl">
						<span class="chip-tvl-label">TVL:</span>
						<span class="chip-tvl-value">{tvl}</span>
					</span>
				{/if}
			</div>
		</div>
	</div>

	<div class="card-price">
		<div class="card-price-label" class:dim={isComingSoon}>Price</div>
		{#if isComingSoon}
			<div class="card-price-value">Coming soon</div>
			<div class="card-pills">
				<span class="chip chip-empty chip-empty-l"></span>
				<span class="chip chip-empty chip-empty-r"></span>
			</div>
		{:else}
			<div class="card-price-row">
				<div class="card-price-value">{price ?? '—'}</div>
			</div>
			<div class="card-pills">
				{#if delta}
					<span class="chip chip-delta chip-delta-{deltaTone}">
						<img class="caret" src="/images/cards/caret-up.svg" alt="" />
						<span>{delta}</span>
					</span>
				{/if}
				<span class="chip chip-period">{period}</span>
			</div>
		{/if}
	</div>

	<div class="card-spark" class:dim={isComingSoon}>
		<img class="card-spark-bg" src={sparklineSrc} alt="" />
	</div>
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 230px;
		padding: var(--space-4) var(--space-4) 0;
		background-color: var(--color-surface); /* #080a0f */
		border-radius: var(--radius-lg); /* 20px per Figma */
		overflow: hidden;
	}

	.card.coming-soon {
		isolation: isolate;
	}

	/* External-link disk */
	.card-go {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-full);
		color: var(--color-text);
		text-decoration: none;
		z-index: 2;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.card-go:hover {
		background-color: var(--color-dark-600);
	}
	.card-go img {
		width: 14px;
		height: 14px;
	}

	/* Top row */
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.card-avatar {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.card-avatar :global(img),
	.card-avatar :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}

	.card-name-block {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.card-name {
		font-family: var(--font-numeric);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-md); /* 16 */
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-wrap: nowrap;
	}

	/* Chips share base look */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 22px;
		padding: 0 6px;
		background-color: var(--color-gray-900-20);
		border-radius: var(--radius-sm); /* 8 */
		font-family: var(--font-body);
		font-weight: var(--font-weight-medium);
		font-size: 12px;
		letter-spacing: var(--tracking-tight);
		white-space: nowrap;
	}

	.chip-symbol {
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	.chip-tvl {
		gap: 4px;
	}
	.chip-tvl-label {
		color: var(--color-text);
	}
	.chip-tvl-value {
		color: var(--color-green-700);
		font-weight: var(--font-weight-bold);
	}

	/* Price section */
	.card-price {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding-top: var(--space-2);
	}

	.card-price-label {
		font-family: var(--font-body);
		font-weight: var(--font-weight-medium);
		font-size: var(--text-2xs); /* 10 */
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-muted);
	}

	.card-price-label.dim {
		color: rgba(113, 115, 144, 0.3);
	}

	.card-price-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}

	.card-price-value {
		font-family: var(--font-numeric);
		font-weight: var(--font-weight-medium);
		font-size: var(--text-xl); /* 24 */
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.card.coming-soon .card-price-value {
		color: var(--color-text);
	}

	.card-pills {
		display: flex;
		gap: var(--space-1);
	}

	.chip-delta {
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: var(--font-weight-bold);
		border-radius: var(--radius-md); /* 12 */
		height: 24px;
	}
	.chip-delta-success {
		background-color: rgba(117, 227, 140, 0.1);
		color: var(--color-green-500);
	}
	.chip-delta-danger {
		background-color: var(--color-danger-tint);
		color: var(--color-red-900);
	}
	.caret {
		width: 8px;
		height: 8px;
	}
	.chip-delta-danger .caret {
		transform: rotate(180deg);
	}

	.chip-period {
		background-color: rgba(255, 255, 255, 0.1);
		color: var(--color-text);
		border-radius: var(--radius-md);
		height: 24px;
		font-family: var(--font-body);
		font-weight: var(--font-weight-medium);
		font-size: 12px;
	}

	.chip-empty {
		background-color: rgba(255, 255, 255, 0.04);
		border-radius: var(--radius-md);
		height: 24px;
		padding: 0;
	}
	.chip-empty-l {
		width: 53px;
	}
	.chip-empty-r {
		width: 36px;
	}

	/* Sparkline — bleeds to card edges (4px inset L/R/B). Per Figma:
	 * top inset ≈ 35.22% (81/230), height ≈ 145px native; price text overlays it. */
	.card-spark {
		position: absolute;
		left: 4px;
		right: 4px;
		bottom: 4px;
		top: 35%;
		pointer-events: none;
		z-index: 0;
		overflow: hidden;
		border-radius: 0 0 calc(var(--radius-lg) - 4px) calc(var(--radius-lg) - 4px);
		background: linear-gradient(to bottom, var(--color-surface), var(--color-dark-600));
	}
	.card-spark.dim {
		opacity: 0.4;
	}
	.card-spark-bg {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: bottom;
		mix-blend-mode: screen;
	}
</style>
