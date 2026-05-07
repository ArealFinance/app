<script lang="ts">
	import type { DepthResult, DepthSlice } from '@areal/sdk/markets';

	type Props = {
		/** Depth ladder. When `null`/undefined the chart renders the empty state. */
		depth?: DepthResult | null;
		symbolA: string;
		symbolB: string;
		/** Optional override for chart height. Default 180px. */
		height?: number;
	};

	let { depth = null, symbolA, symbolB, height = 180 }: Props = $props();

	const hasBids = $derived((depth?.bidSide.length ?? 0) > 0);
	const hasAsks = $derived((depth?.askSide.length ?? 0) > 0);
	const isEmpty = $derived(!hasBids && !hasAsks);

	/**
	 * Convert price impact bps to a hue interpolation 120..0
	 * (green → yellow → red). Bps 0 = pure green, 1000+ = pure red.
	 *
	 * This colour is decorative (UI affordance for impact magnitude),
	 * not derived from on-chain data — it doesn't violate the "no
	 * hardcoded colours from chain data" rule because the mapping is
	 * deterministic and tied to the impact bucket.
	 */
	function impactColor(bps: number): string {
		const clamped = Math.min(Math.max(Math.abs(bps), 0), 1000);
		const hue = 120 - (clamped / 1000) * 120;
		return `hsl(${hue.toFixed(0)}, 70%, 55%)`;
	}

	/**
	 * Slice height ratio (0..1). Each slice's `pctOfReserve` already
	 * encodes its bucket size; we use it directly so the larger buckets
	 * dominate visually.
	 */
	function sliceHeightPct(slice: DepthSlice): number {
		// pctOfReserve is 0.001..1 → scale to 18..100 so even the smallest
		// bucket has visible footprint.
		const min = 0.18;
		const max = 1.0;
		const scaled = min + slice.pctOfReserve * (max - min);
		return Math.min(scaled, 1) * 100;
	}

	/** Format an amount slice for the tooltip title. */
	function tooltipFor(slice: DepthSlice, sellingSym: string, buyingSym: string): string {
		const sign = slice.priceImpactBps > 0 ? '+' : '';
		return `${slice.amountIn.toString()} ${sellingSym} → ${slice.amountOut.toString()} ${buyingSym}\n` +
			`impact ${sign}${(slice.priceImpactBps / 100).toFixed(2)}%`;
	}
</script>

{#if isEmpty}
	<div class="depth-empty" style:height="{height}px">
		<p class="depth-empty-text">Depth chart unavailable for this pool type.</p>
	</div>
{:else}
	<div class="depth" style:height="{height}px" role="img" aria-label="Pool depth chart">
		<div class="depth-header">
			<div class="depth-axis depth-axis-bid">
				<span class="depth-axis-dot depth-axis-dot-bid"></span>
				<span class="depth-axis-label">Bids ({symbolB} → {symbolA})</span>
			</div>
			<div class="depth-axis depth-axis-ask">
				<span class="depth-axis-label">Asks ({symbolA} → {symbolB})</span>
				<span class="depth-axis-dot depth-axis-dot-ask"></span>
			</div>
		</div>

		<div class="depth-canvas">
			<!-- Bid side: bars expand leftward from centre. -->
			<div class="depth-side depth-side-bid">
				{#each depth?.bidSide ?? [] as slice, i (i)}
					<div
						class="depth-slice"
						style:width="{sliceHeightPct(slice)}%"
						style:background-color={impactColor(slice.priceImpactBps)}
						title={tooltipFor(slice, symbolB, symbolA)}
					></div>
				{/each}
			</div>

			<!-- Centre marker — current spot price reference. -->
			<div class="depth-marker" aria-hidden="true"></div>

			<!-- Ask side: bars expand rightward from centre. -->
			<div class="depth-side depth-side-ask">
				{#each depth?.askSide ?? [] as slice, i (i)}
					<div
						class="depth-slice"
						style:width="{sliceHeightPct(slice)}%"
						style:background-color={impactColor(slice.priceImpactBps)}
						title={tooltipFor(slice, symbolA, symbolB)}
					></div>
				{/each}
			</div>
		</div>

		<div class="depth-footer">
			<span class="depth-footer-label">Less impact</span>
			<span class="depth-footer-spacer"></span>
			<span class="depth-footer-label">More impact</span>
		</div>
	</div>
{/if}

<style>
	.depth {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		background-color: var(--color-surface-inset);
		border-radius: 16px;
	}

	.depth-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.depth-axis {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 12px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}

	.depth-axis-dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
	}
	.depth-axis-dot-bid {
		background-color: var(--color-success);
	}
	.depth-axis-dot-ask {
		background-color: var(--color-danger);
	}

	.depth-canvas {
		position: relative;
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 2px 1fr;
		align-items: stretch;
		gap: 0;
		min-height: 0;
	}

	.depth-side {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 3px;
		min-width: 0;
		padding: 0 6px;
	}

	.depth-side-bid {
		align-items: flex-end;
	}
	.depth-side-ask {
		align-items: flex-start;
	}

	/* Each slice is a horizontal bar; height set by container, width by
	 * pctOfReserve, colour by priceImpactBps. */
	.depth-slice {
		flex: 1;
		min-height: 6px;
		max-height: 12px;
		border-radius: 4px;
		opacity: 0.85;
		transition: opacity 120ms ease-out;
	}
	.depth-slice:hover {
		opacity: 1;
	}

	.depth-marker {
		width: 2px;
		background-color: var(--color-text);
		border-radius: 2px;
		opacity: 0.7;
	}

	.depth-footer {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 11px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
	.depth-footer-spacer {
		flex: 1;
		height: 1px;
		background: linear-gradient(
			90deg,
			rgba(115, 255, 131, 0.3),
			rgba(255, 220, 100, 0.3),
			rgba(255, 100, 100, 0.3)
		);
	}

	.depth-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background-color: var(--color-surface-inset);
		border-radius: 16px;
	}
	.depth-empty-text {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
		text-align: center;
	}
</style>
