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
	// Any clickable card (internal or external) gets the corner arrow on
	// hover. External-only `target="_blank"` keeps the new-tab semantic
	// distinct from internal SPA navigation.
	const hasLink = $derived(href !== undefined && !isComingSoon);
	const showCornerArrow = $derived(hasLink);
</script>

<article class="card" class:coming-soon={isComingSoon} class:card-linkable={hasLink}>
	{#if hasLink}
		<!-- Stretched-link overlay: covers the whole card so any click on
		     the card navigates. Visually invisible. -->
		<a class="card-link-overlay" {href} aria-label="Open {name}"></a>
	{/if}
	{#if showCornerArrow}
		<a
			class="card-go"
			{href}
			aria-label="Open {name}"
			target={external ? '_blank' : undefined}
			rel={external ? 'noopener' : undefined}
		>
			<img src="/images/cards/go-button.svg" alt="" width="44" height="44" />
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
		<!-- Top row: "PRICE" label on the left, delta + period chips on the
		     right. Per Figma macet — both anchored at top:36-38% of the card,
		     same horizontal baseline. Coming-soon cards put dimmer empty
		     placeholder pills below the value instead. -->
		<div class="card-price-row-top">
			<span class="card-price-label" class:dim={isComingSoon}>Price</span>
			{#if !isComingSoon}
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
		<div class="card-price-value">
			{isComingSoon ? 'Coming soon' : (price ?? '—')}
		</div>
		{#if isComingSoon}
			<div class="card-pills">
				<span class="chip chip-empty chip-empty-l"></span>
				<span class="chip chip-empty chip-empty-r"></span>
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

	.card-linkable {
		cursor: pointer;
	}
	/* No background-color shift on hover — the corner go-button disk is the
	 * hover affordance per Figma macet. Changing the card surface here would
	 * clash with the disk's own --color-surface-inset bg. */

	/* Stretched-link overlay — invisible <a> covering the whole card so any
	 * click on the surface navigates. Sits above .card-price (z=1) and
	 * .card-spark (z=0); only the corner arrow (z=3) overlays it. */
	.card-link-overlay {
		position: absolute;
		inset: 0;
		z-index: 2;
		border-radius: inherit;
	}
	.card-link-overlay:focus-visible {
		outline: 2px solid var(--color-primary, #a56eff);
		outline-offset: -2px;
	}

	/* External-link disk — Figma macet `Property 1=Variant2`: 44×44 in the
	 * top-right corner with 4px inset. Disk bg + arrow-up-right icon are
	 * baked into the canonical SVG (#181A29 disk, #FBF2FF arrow), so this
	 * rule only handles positioning + hover-fade.
	 *
	 * Default state hides the button; hover/focus on the card surfaces it.
	 * Stays in the DOM with `pointer-events: none` + `opacity: 0` for an
	 * accessible fade-in. */
	.card-go {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 44px;
		height: 44px;
		display: block;
		text-decoration: none;
		z-index: 3;
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--motion-base) var(--ease-out);
	}
	.card:hover .card-go,
	.card:focus-within .card-go,
	.card-go:focus-visible {
		opacity: 1;
		pointer-events: auto;
	}
	.card-go img {
		display: block;
		width: 100%;
		height: 100%;
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
		border-radius: 17px;
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

	/* Chips share base look — Figma: Inter Semi Bold 14px, tracking -0.6px,
	 * height 24px, padding 6px horizontal, bg rgba(113,115,144,0.2), radius 8px. */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 24px;
		padding: 0 6px;
		background-color: var(--color-gray-900-20);
		border-radius: var(--radius-sm); /* 8 */
		font-family: var(--font-body);
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-base); /* 14 */
		letter-spacing: var(--tracking-tight);
		white-space: nowrap;
	}

	.chip-symbol {
		color: var(--color-text-muted);
	}

	.chip-tvl {
		gap: 4px;
	}
	.chip-tvl-label {
		color: var(--color-text);
	}
	.chip-tvl-value {
		color: var(--color-green-700);
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
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-sm); /* 13 */
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-muted);
	}

	.card-price-label.dim {
		color: rgba(113, 115, 144, 0.3);
	}

	/* Top row: "PRICE" label + (delta + period) chips, same horizontal
	 * baseline per Figma macet. Chips right-aligned via space-between. */
	.card-price-row-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
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
		font-size: var(--text-sm); /* 13 — Figma Geist Mono SemiBold 13 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-snug);
		border-radius: var(--radius-md); /* 12 */
		height: 28px; /* Figma macet — period/delta chips are taller than ticker/TVL chips */
	}
	.chip-delta-success {
		background-color: rgba(117, 227, 140, 0.1);
		color: #75e38c;
	}
	.chip-delta-danger {
		background-color: var(--color-danger-tint);
		color: var(--color-red-900);
	}
	.caret {
		width: 14px; /* Figma caret bounding-box; the SVG arrow itself sits inside with padding */
		height: 14px;
	}
	.chip-delta-danger .caret {
		transform: rotate(180deg);
	}

	.chip-period {
		background-color: rgba(255, 255, 255, 0.1);
		color: var(--color-text);
		border-radius: var(--radius-md);
		height: 28px; /* Figma macet — period chip pairs with delta chip at 28px */
		font-family: var(--font-body);
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-sm); /* 13 — Figma Inter SemiBold 13 */
		letter-spacing: var(--tracking-snug);
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

	/* Graph rect — Figma macet `Rectangle 40175` + `Rectangle 40176`:
	 *   - 4px inset on all sides (1.37% × card width)
	 *   - top: 35.22% × card height (≈81px from card top)
	 *   - all 4 corners rounded 20px (16px after subtracting the 4px inset)
	 *   - bg: linear-gradient(180deg, #080A0F 0%, #2E2E2E 100%) — dark top
	 *     fading to slightly-lighter dark at the bottom. The price label/
	 *     value/chips above (z-index 1) overlap the rect's upper portion.
	 */
	.card-spark {
		position: absolute;
		left: 4px;
		right: 4px;
		bottom: 4px;
		top: 35%;
		pointer-events: none;
		z-index: 0;
		overflow: hidden;
		border-radius: calc(var(--radius-lg) - 4px);
		background: linear-gradient(180deg, var(--color-dark-900) 0%, #2e2e2e 100%);
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
	}
</style>
