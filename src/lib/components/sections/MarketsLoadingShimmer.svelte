<script lang="ts" module>
	export type MarketsLoadingShimmerVariant = 'card' | 'row' | 'detail';
</script>

<script lang="ts">
	type Props = {
		/**
		 * `card`   — matches `TokenStatCard` shape (avatar disk + 2 text lines).
		 * `row`    — matches a list-row shape (logos + text + spacer + pill).
		 * `detail` — matches `routes/markets/[symbol]/+page.svelte` skeleton:
		 *            token header (logo + symbol + price), KPI strip, large
		 *            chart placeholder. Used while the markets snapshot is
		 *            still resolving and we don't yet know if the token
		 *            exists on this network.
		 */
		variant?: MarketsLoadingShimmerVariant;
	};

	let { variant = 'card' }: Props = $props();
</script>

{#if variant === 'card'}
	<article class="shimmer-card" aria-hidden="true" aria-label="Loading">
		<div class="shimmer-head">
			<span class="shimmer-block shimmer-disk"></span>
			<div class="shimmer-name">
				<span class="shimmer-block shimmer-line shimmer-line-name"></span>
				<span class="shimmer-block shimmer-line shimmer-line-meta"></span>
			</div>
		</div>
		<div class="shimmer-price">
			<span class="shimmer-block shimmer-line shimmer-line-label"></span>
			<span class="shimmer-block shimmer-line shimmer-line-value"></span>
			<span class="shimmer-block shimmer-line shimmer-line-pill"></span>
		</div>
	</article>
{:else if variant === 'row'}
	<div class="shimmer-row" aria-hidden="true" aria-label="Loading">
		<span class="shimmer-block shimmer-row-logo"></span>
		<span class="shimmer-block shimmer-row-text"></span>
		<span class="shimmer-row-spacer"></span>
		<span class="shimmer-block shimmer-row-pill"></span>
	</div>
{:else}
	<!-- Detail layout: header (logo + symbol/sub-line + price column),
	     KPI strip (4 metrics), chart placeholder.
	     Mirrors the loaded structure of routes/markets/[symbol]/+page.svelte
	     so the layout doesn't shift on hydration. -->
	<div class="shimmer-detail" aria-hidden="true" aria-label="Loading">
		<header class="shimmer-detail-head">
			<span class="shimmer-block shimmer-detail-logo"></span>
			<div class="shimmer-detail-title">
				<span class="shimmer-block shimmer-line shimmer-detail-symbol"></span>
				<span class="shimmer-block shimmer-line shimmer-detail-meta"></span>
			</div>
			<div class="shimmer-detail-price">
				<span class="shimmer-block shimmer-line shimmer-detail-price-value"></span>
				<span class="shimmer-block shimmer-line shimmer-detail-price-delta"></span>
			</div>
		</header>

		<div class="shimmer-detail-kpis">
			<div class="shimmer-detail-kpi">
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-label"></span>
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-value"></span>
			</div>
			<div class="shimmer-detail-kpi">
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-label"></span>
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-value"></span>
			</div>
			<div class="shimmer-detail-kpi">
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-label"></span>
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-value"></span>
			</div>
			<div class="shimmer-detail-kpi">
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-label"></span>
				<span class="shimmer-block shimmer-line shimmer-detail-kpi-value"></span>
			</div>
		</div>

		<div class="shimmer-block shimmer-detail-chart"></div>
	</div>
{/if}

<style>
	/* Shared block: tinted surface + soft animated sheen.
	 * Animation is disabled when the user prefers reduced motion. */
	.shimmer-block {
		display: block;
		background-color: var(--color-surface-inset);
		border-radius: 8px;
		position: relative;
		overflow: hidden;
	}
	.shimmer-block::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent,
			rgba(255, 255, 255, 0.04),
			transparent
		);
		transform: translateX(-100%);
		animation: shimmer-sweep 1.4s ease-in-out infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.shimmer-block::after {
			animation: none;
		}
	}

	@keyframes shimmer-sweep {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	/* ─── Card variant — mirrors TokenStatCard footprint. ─── */
	.shimmer-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 230px;
		padding: var(--space-4);
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
	}

	.shimmer-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.shimmer-disk {
		width: 44px;
		height: 44px;
		border-radius: 17px;
		flex-shrink: 0;
	}

	.shimmer-name {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}

	.shimmer-line {
		height: 14px;
		border-radius: 6px;
	}
	.shimmer-line-name {
		width: 70%;
	}
	.shimmer-line-meta {
		width: 40%;
		height: 18px;
	}

	.shimmer-price {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: auto;
	}
	.shimmer-line-label {
		width: 30%;
		height: 10px;
	}
	.shimmer-line-value {
		width: 60%;
		height: 22px;
	}
	.shimmer-line-pill {
		width: 35%;
		height: 22px;
	}

	/* ─── Row variant — mirrors a pool/token list row footprint. ─── */
	.shimmer-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 18px;
		background-color: var(--color-surface-inset);
		border-radius: 32px;
	}
	.shimmer-row-logo {
		width: 32px;
		height: 32px;
		border-radius: 12px;
	}
	.shimmer-row-text {
		height: 16px;
		max-width: 180px;
		border-radius: 6px;
	}
	/* .shimmer-row-spacer is the implicit `1fr` grid track between the
	 * text block and the pill — it just reserves space and needs no
	 * styles of its own (an empty ruleset trips svelte-check). */
	.shimmer-row-pill {
		width: 80px;
		height: 32px;
		border-radius: 12px;
	}

	/* ─── Detail variant — mirrors `routes/markets/[symbol]/+page.svelte`
	 *      header + KPI strip + chart skeleton. ─── */
	.shimmer-detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-6);
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
	}
	.shimmer-detail-head {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--space-4);
	}
	.shimmer-detail-logo {
		width: 56px;
		height: 56px;
		border-radius: var(--radius-md);
	}
	.shimmer-detail-title {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.shimmer-detail-symbol {
		width: 60%;
		max-width: 220px;
		height: 24px;
	}
	.shimmer-detail-meta {
		width: 40%;
		max-width: 160px;
		height: 14px;
	}
	.shimmer-detail-price {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-end;
	}
	.shimmer-detail-price-value {
		width: 120px;
		height: 24px;
	}
	.shimmer-detail-price-delta {
		width: 70px;
		height: 14px;
	}

	.shimmer-detail-kpis {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-3);
	}
	@media (min-width: 768px) {
		.shimmer-detail-kpis {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.shimmer-detail-kpi {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: var(--space-3);
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-md);
	}
	.shimmer-detail-kpi-label {
		width: 50%;
		height: 12px;
	}
	.shimmer-detail-kpi-value {
		width: 80%;
		height: 20px;
	}

	.shimmer-detail-chart {
		width: 100%;
		height: 240px;
		border-radius: var(--radius-md);
	}
</style>
