<script lang="ts" module>
	import type { PublicKey } from '@solana/web3.js';
	import type { Period, SnapshotsStore } from '$lib/markets/snapshots.svelte';
	import type { SnapshotRow, DailyAggregateRow } from '@areal/sdk/markets-rest';

	export type PoolHistoryChartProps = {
		/** Pool to track. `null` means the parent page is still resolving. */
		pool: PublicKey | null;
		/** Headline price label rendered as a pill on the chart's last point. */
		currentPrice?: string;
		/** Active period — bindable so the parent can persist or reflect it. */
		period?: Period;
		/**
		 * Optional store override for tests / Storybook. Production renders
		 * use the runes-singleton.
		 */
		store?: SnapshotsStore;
	};
</script>

<script lang="ts">
	/*
	 * Pool history chart wrapper. Owns the period tabs UI (moved here from
	 * `/markets/[symbol]/+page.svelte`) and binds to the singleton
	 * `snapshotsStore` for the data series.
	 *
	 * Series mapping:
	 *   - 24H (live snapshots): `tvlUsd / lpSupply * 10**lpDecimals` as a
	 *     USD-per-LP-share proxy. The snapshot wire shape still doesn't
	 *     surface per-token USD prices, so this proxy is the closest
	 *     signed-USD value we can render at sub-day granularity.
	 *     Fallback: ratio `Number(reserveB) / Number(reserveA)` — token
	 *     denomination, useful when `tvlUsd` is null on a freshly-priced pool.
	 *   - 7D / 1M / 3M / 6M / 1Y / ALL (daily aggregate): real per-token
	 *     USDC price for token A from `priceAUsdc` on each `DailyAggregateRow`.
	 *     Backend (Phase 12.3.3-I) hydrates this from the latest snapshot at
	 *     or before each day's UTC end. Rows without a price (pre-12.3.3.1
	 *     historical aggregates, unpriceable tokens) are skipped — the chart
	 *     drops the point rather than crashing.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { snapshotsStore as defaultStore } from '$lib/markets/snapshots.svelte';
	import PriceChart from '$lib/components/charts/PriceChart.svelte';
	import type { PricePoint } from '$lib/components/charts/PriceChart.svelte';

	let {
		pool,
		currentPrice,
		period = $bindable<Period>('24H'),
		store = defaultStore
	}: PoolHistoryChartProps = $props();

	const PERIODS: ReadonlyArray<Period> = ['24H', '7D', '1M', '3M', '6M', '1Y', 'ALL'];

	// LP decimals are not on the REST shape — assume Solana SPL default of 9.
	// `priceFromSnapshot` cancels out the decimal scaling between numerator
	// (tvlUsd, in $) and denominator (lpSupply / 10^9), so this constant
	// stays an internal proxy assumption rather than a wire contract.
	const LP_DECIMALS_ASSUMED = 9;

	function priceFromSnapshot(row: SnapshotRow): number | null {
		if (row.tvlUsd !== null && row.tvlUsd > 0) {
			const supply = Number(row.lpSupply) / 10 ** LP_DECIMALS_ASSUMED;
			if (supply > 0) return row.tvlUsd / supply;
		}
		const a = Number(row.reserveA);
		const b = Number(row.reserveB);
		if (a > 0) return b / a;
		return null;
	}

	function priceFromAggregate(row: DailyAggregateRow): number | null {
		// Phase 12.3.3 R-I: backend now surfaces latest-snapshot prices on
		// each daily aggregate row. Pick token A's USD price as the canonical
		// y-axis (matches what most users want — the priced side of a stable
		// /quote pair). When unavailable (pre-12.3.3.1 historical rows or
		// unpriceable token) return null → consumer drops the point.
		if (typeof row.priceAUsdc === 'number' && Number.isFinite(row.priceAUsdc)) {
			return row.priceAUsdc;
		}
		return null;
	}

	const chartData = $derived<PricePoint[]>(
		(() => {
			// 24H period uses live snapshot rows (sorted ASC).
			// We render USD-per-LP-share on the y-axis (see priceFromSnapshot).
			if (period === '24H' && store.rows.length > 0) {
				const points: PricePoint[] = [];
				for (const r of store.rows) {
					const y = priceFromSnapshot(r);
					if (y === null) continue;
					points.push({ x: r.blockTime, y });
				}
				return points;
			}
			// 7D / 1M / 3M / 6M / 1Y / ALL — use real priceAUsdc from latest
			// snapshot at each day boundary (Phase 12.3.3 R-I — backend
			// DailyAggregateRow.priceAUsdc surfaces it via `MarketsService`
			// 2-step lookup).
			//
			// `store.aggregate` arrives newest-first from REST; reverse so
			// the chart x-axis runs ASC (oldest → newest, left → right).
			// Use the running array index for `x` (LayerCake just needs a
			// monotonic numeric domain); per-day labels are rendered via
			// `chartXLabels` from `row.day`.
			if (period !== '24H' && store.aggregate.length > 0) {
				const sorted = [...store.aggregate].reverse();
				const points: PricePoint[] = [];
				for (let i = 0; i < sorted.length; i++) {
					const y = priceFromAggregate(sorted[i]!);
					if (y === null) continue;
					points.push({ x: i, y });
				}
				return points;
			}
			return [];
		})()
	);


	function formatTimestamp(blockTime: number): string {
		// 24H labels render as `HH:MM` (clock time). Non-24H periods get
		// per-day labels from `formatDayLabel(row.day)` instead, so this
		// helper is intentionally clock-only after Phase 12.3.3-I.
		const d = new Date(blockTime * 1000);
		const HH = String(d.getHours()).padStart(2, '0');
		const MM = String(d.getMinutes()).padStart(2, '0');
		return `${HH}:${MM}`;
	}

	function formatDayLabel(day: string): string {
		// Input is ISO `YYYY-MM-DD`; render as `dd.mm`.
		const [, m, d] = day.split('-');
		return `${d}.${m}`;
	}

	const chartXLabels = $derived<string[]>(
		(() => {
			const TICK_COUNT = 9;
			if (period === '24H' && store.rows.length > 0) {
				const labels: string[] = [];
				const len = store.rows.length;
				for (let i = 0; i < TICK_COUNT; i++) {
					const idx = Math.round((i / (TICK_COUNT - 1)) * (len - 1));
					const r = store.rows[idx]!;
					labels.push(formatTimestamp(r.blockTime));
				}
				return labels;
			}
			if (period !== '24H' && store.aggregate.length > 0) {
				const sorted = [...store.aggregate].reverse();
				const labels: string[] = [];
				const len = sorted.length;
				for (let i = 0; i < TICK_COUNT; i++) {
					const idx = Math.round((i / (TICK_COUNT - 1)) * (len - 1));
					labels.push(formatDayLabel(sorted[idx]!.day));
				}
				return labels;
			}
			return [];
		})()
	);

	$effect(() => {
		if (pool !== null) {
			store.activate(pool);
		}
	});

	$effect(() => {
		store.setPeriod(period);
	});

	onDestroy(() => {
		store.deactivate();
	});
</script>

<section class="chart-card">
	<div class="chart-tabs" role="tablist">
		{#each PERIODS as p (p)}
			<button
				type="button"
				class="chart-tab"
				class:chart-tab-active={period === p}
				role="tab"
				aria-selected={period === p}
				onclick={() => (period = p)}
			>
				{p}
			</button>
		{/each}
		{#if store.isStale}
			<span class="stale-badge" title="Live stream is delayed; data may be slightly out of date">
				STALE
			</span>
		{/if}
	</div>

	<div class="chart-area">
		{#if store.status === 'loading' && chartData.length === 0}
			<div class="state state-skeleton" aria-hidden="true">
				<div class="skeleton-bar" style="width: 80%"></div>
				<div class="skeleton-bar" style="width: 60%"></div>
				<div class="skeleton-bar" style="width: 70%"></div>
			</div>
		{:else if store.status === 'error'}
			<div class="state state-error">
				<p class="state-title">Could not load chart</p>
				{#if store.error}
					<p class="state-sub">{store.error}</p>
				{/if}
				<button
					type="button"
					class="retry-btn"
					onclick={() => {
						if (pool) store.activate(pool);
					}}
				>
					Retry
				</button>
			</div>
		{:else if chartData.length === 0}
			<div class="state state-empty">
				<p class="state-title">No price data for {period}</p>
				<p class="state-sub">Backend has no recorded snapshots for this period yet.</p>
			</div>
		{:else}
			<PriceChart data={chartData} {currentPrice} xLabels={chartXLabels} />
		{/if}
	</div>
</section>

<style>
	.chart-card {
		position: relative;
		min-height: 455px;
		background-color: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.chart-tabs {
		display: inline-flex;
		gap: 24px;
		padding: 4px 0;
		align-items: center;
	}
	.chart-tab {
		position: relative;
		background: transparent;
		border: 0;
		padding: 4px 2px;
		cursor: pointer;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.2px;
		color: var(--color-text-muted);
		transition: color var(--motion-base) var(--ease-out);
	}
	.chart-tab:hover {
		color: var(--color-text);
	}
	.chart-tab-active {
		color: var(--color-text);
	}
	.chart-tab-active::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -4px;
		height: 2px;
		background-color: var(--color-text);
		border-radius: 2px;
	}
	.stale-badge {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: var(--radius-xs);
		background-color: rgba(255, 196, 0, 0.15);
		color: #ffc400;
		font-family: var(--font-mono, var(--font-body));
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
	}
	.chart-area {
		display: flex;
		flex-direction: column;
		height: 320px;
	}

	.state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-3);
		text-align: center;
		color: var(--color-text-muted);
	}
	.state-skeleton {
		gap: var(--space-3);
		align-items: stretch;
		justify-content: center;
		padding: var(--space-4) var(--space-6);
	}
	.skeleton-bar {
		height: 12px;
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-xs);
		animation: skeleton-pulse 1.4s ease-in-out infinite;
	}
	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 0.7;
		}
	}
	.state-title {
		margin: 0;
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.state-sub {
		margin: 0;
		max-width: 320px;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
	.retry-btn {
		margin-top: var(--space-3);
		padding: 8px 18px;
		background-color: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
	}
	.retry-btn:hover {
		background-color: var(--color-hover-tint);
	}
</style>
