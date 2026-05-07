<script lang="ts">
	type MetricRow = {
		label: string;
		value: string;
	};

	type Props = {
		title?: string;
		/** Pair symbols rendered above the metric grid. */
		symbolA: string;
		symbolB: string;
		/** Reserve A, formatted (e.g. "10.00K"). */
		reserveA: string;
		reserveB: string;
		/** Spot price string, e.g. "1 RWT = 0.99 USDC". */
		spotPrice: string;
		/** Fee tier string, e.g. "0.30%". */
		fee: string;
		/** Optional extra rows (e.g. depth-derived metrics). */
		extra?: MetricRow[];
	};

	let {
		title = 'Pool Metrics',
		symbolA,
		symbolB,
		reserveA,
		reserveB,
		spotPrice,
		fee,
		extra = []
	}: Props = $props();
</script>

<article class="metrics-card" aria-labelledby="pool-metrics-title">
	<header class="metrics-head">
		<h3 id="pool-metrics-title" class="metrics-title">{title}</h3>
	</header>

	<div class="metrics-grid">
		<div class="metric">
			<span class="metric-label">Reserve {symbolA}</span>
			<span class="metric-value">{reserveA}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Reserve {symbolB}</span>
			<span class="metric-value">{reserveB}</span>
		</div>
		<div class="metric metric-wide">
			<span class="metric-label">Spot Price</span>
			<span class="metric-value">{spotPrice}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Fee Tier</span>
			<span class="metric-value">{fee}</span>
		</div>
		{#each extra as row (row.label)}
			<div class="metric">
				<span class="metric-label">{row.label}</span>
				<span class="metric-value">{row.value}</span>
			</div>
		{/each}
	</div>
</article>

<style>
	.metrics-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 20px;
		background-color: var(--color-surface);
		border-radius: 24px;
	}

	.metrics-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.metrics-title {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px 24px;
	}

	.metric {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.metric-wide {
		grid-column: 1 / -1;
	}

	.metric-label {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 12px;
		letter-spacing: -0.4px;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.metric-value {
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 16px;
		letter-spacing: -0.6px;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}
</style>
