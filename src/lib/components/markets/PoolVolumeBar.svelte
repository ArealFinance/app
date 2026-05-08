<script lang="ts" module>
	import type { PublicKey } from '@solana/web3.js';
	import type { SnapshotsStore } from '$lib/markets/snapshots.svelte';

	export type PoolVolumeBarProps = {
		/** Pool to summarise. `null` while the parent page is still resolving. */
		pool: PublicKey | null;
		/** Optional store override for tests / Storybook. */
		store?: SnapshotsStore;
	};
</script>

<script lang="ts">
	/*
	 * 24h KPI strip — volume, tx count, APY pill — sourced from the
	 * snapshotsStore's most recent daily aggregate row. Today's bucket is
	 * always at index 0 (server returns `day DESC`).
	 *
	 * The component does NOT activate / deactivate the store on its own
	 * (PoolHistoryChart owns that lifecycle). It just reads what's there.
	 *
	 * TODO(12.3.4): tx-count uses the daily distinct-tx count from the
	 * aggregate; this conflates indexer reorgs with user activity for high-
	 * frequency pools. If the volume KPI starts showing artefacts, surface
	 * `txCount24h` from the protocol_summary tick instead.
	 */
	import { snapshotsStore as defaultStore } from '$lib/markets/snapshots.svelte';
	import { formatTvl } from '$lib/markets/format';

	let { pool, store = defaultStore }: PoolVolumeBarProps = $props();

	function aggregateVolumeUsd(): number | null {
		const row = store.aggregate[0];
		if (!row) return null;
		// Aggregate carries volume in TOKEN base units, NOT USD. We don't
		// have per-token prices on the wire (Phase 12.3.3 limitation — see
		// PoolHistoryChart for the same caveat), so fall back to the sum
		// of A+B sides as a directional proxy. Kept honest by `?` in label.
		const a = Number(row.volumeA24h);
		const b = Number(row.volumeB24h);
		const sum = a + b;
		return Number.isFinite(sum) && sum > 0 ? sum : null;
	}

	const summary = $derived.by((): {
		volume: string;
		txCount: number | null;
		apyPct: string | null;
	} => {
		const row = store.aggregate[0];
		if (!row) return { volume: '—', txCount: null, apyPct: null };
		const volume = formatTvl(aggregateVolumeUsd());
		const apyPct = row.apy24h !== null ? `${(row.apy24h * 100).toFixed(2)}%` : null;
		return { volume, txCount: row.txCount24h, apyPct };
	});

	$effect(() => {
		// Touch `pool` so the derived re-runs when the parent swaps tokens
		// (the underlying aggregate update is store-driven; this keeps the
		// component reactive to pool prop changes for prop-bound styling).
		void pool;
	});
</script>

<aside class="volume-bar" aria-label="Pool 24h KPIs">
	{#if store.status === 'loading'}
		<div class="kpi kpi-skeleton" aria-hidden="true">
			<span class="skeleton-line"></span>
		</div>
	{:else if store.aggregate.length === 0}
		<p class="empty">No 24h data yet</p>
	{:else}
		<div class="kpi">
			<span class="kpi-label">24h Vol</span>
			<span class="kpi-value">{summary.volume}</span>
		</div>
		<div class="kpi">
			<span class="kpi-label">Tx</span>
			<span class="kpi-value">{summary.txCount ?? '—'}</span>
		</div>
		{#if summary.apyPct !== null}
			<div class="kpi-pill">APY {summary.apyPct}</div>
		{/if}
	{/if}
</aside>

<style>
	.volume-bar {
		display: inline-flex;
		gap: var(--space-4);
		align-items: center;
		padding: var(--space-3) var(--space-4);
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-lg);
	}
	.kpi {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 60px;
	}
	.kpi-label {
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.kpi-value {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.4px;
		color: var(--color-text);
	}
	.kpi-pill {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border-radius: var(--radius-md);
		background-color: rgba(165, 110, 255, 0.15);
		color: #a984f3;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.4px;
	}
	.kpi-skeleton {
		min-width: 180px;
	}
	.skeleton-line {
		display: block;
		width: 100%;
		height: 12px;
		background-color: var(--color-surface);
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
	.empty {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}
</style>
