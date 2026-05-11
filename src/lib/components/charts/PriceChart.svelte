<script lang="ts" module>
	export type PricePoint = { x: number; y: number };
</script>

<script lang="ts">
	import { LayerCake, Svg } from 'layercake';
	import PriceChartAreas from './PriceChartAreas.svelte';

	type Props = {
		data?: PricePoint[];
		/** Optional pill anchored to the last data point (e.g. "0.9984"). */
		currentPrice?: string;
		/** Optional row of equally-spaced labels rendered under the chart (e.g. dates). */
		xLabels?: string[];
		/**
		 * Centered rolling-average window applied to `y` values before
		 * rendering. Defaults to 9, which dissolves the plateau-edge
		 * corners on sparse Testnet NAV data into gentle slopes without
		 * flattening the underlying trend. Paired with the `curveBumpX`
		 * stroke in the renderer, the combination produces the wavy aesthetic
		 * shown in the Figma macet even on data with abrupt single-tick
		 * jumps. Set to `1` to bypass smoothing entirely (mock data, dense
		 * mainnet series).
		 */
		smoothingWindow?: number;
	};

	let { data = generateMockData(), currentPrice, xLabels, smoothingWindow = 9 }: Props = $props();

	function generateMockData(): PricePoint[] {
		// Smooth-ish growth + dip + recovery. Range ~7-15.
		const N = 60;
		return Array.from({ length: N }, (_, i) => {
			const t = i / (N - 1);
			const trend = 7 + 8 * t;
			const wave = Math.sin(i / 6) * 0.6 + Math.sin(i / 13) * 0.9;
			return { x: i, y: trend + wave };
		});
	}

	/**
	 * Centered moving-average smoother. Each output `y[i]` is the mean of
	 * `data[i - half ... i + half]`, clamped at the boundaries so the
	 * endpoints stay glued to the source values (last-point pill / first
	 * label keep their real numbers).
	 *
	 * Window is forced to an odd integer >= 1 so the "centered" symmetry is
	 * preserved; an even window biases left or right by half a slot.
	 */
	function smoothSeries(input: PricePoint[], window: number): PricePoint[] {
		if (input.length < 2) return input;
		const w = Math.max(1, Math.round(window));
		if (w <= 1) return input;
		const odd = w % 2 === 0 ? w + 1 : w;
		const half = (odd - 1) / 2;
		const last = input.length - 1;
		return input.map((pt, i) => {
			// First and last points stay exact — the badge label and the
			// leftmost gridline label both anchor to those numbers, so any
			// drift between displayed value and rendered y would read as
			// a glitch. Interior points smooth with a symmetric window
			// (shrunk at the boundaries to avoid sampling outside the
			// series).
			if (i === 0 || i === last) return pt;
			const lo = Math.max(0, i - half);
			const hi = Math.min(last, i + half);
			let sum = 0;
			for (let j = lo; j <= hi; j++) sum += input[j]!.y;
			return { x: pt.x, y: sum / (hi - lo + 1) };
		});
	}

	const smoothedRaw = $derived(smoothSeries(data, smoothingWindow));

	/**
	 * Repeat the first and last points twice so `curveBasis` (B-spline)
	 * gets pulled exactly onto the real endpoints. Without this anchoring
	 * the rendered line floats inside the convex hull of the control
	 * points — at the right edge that would visually disconnect from the
	 * trailing price pill ("0.9238"). Two repeats are enough: a cubic
	 * B-spline reaches a control point when it has multiplicity 3 in the
	 * sequence (the duplicate + the original = 3 total).
	 */
	const smoothed = $derived.by<PricePoint[]>(() => {
		if (smoothedRaw.length === 0) return smoothedRaw;
		const first = smoothedRaw[0]!;
		const last = smoothedRaw[smoothedRaw.length - 1]!;
		return [first, first, ...smoothedRaw, last, last];
	});

	const xDomain = $derived<[number, number]>([
		smoothed[0]?.x ?? 0,
		smoothed[smoothed.length - 1]?.x ?? 1
	]);

	/**
	 * Expanded yDomain so the data sits roughly in the center of the canvas
	 * (matches the Figma macet) instead of being stretched edge-to-edge by
	 * LayerCake's default auto-scale. With auto-scale a 0.5 → 0.9 NAV swing
	 * fills the entire chart height; tiny mid-day wiggles end up looking
	 * like dramatic crashes/spikes.
	 *
	 * Window picked as `max(range × 3, midpoint × 0.15)`:
	 *  - The `× 3` factor anchors the data band at ~33% of canvas height
	 *    for typical swings, leaving the rest as "breathing room".
	 *  - The `× 0.15` floor saves micro-swings (e.g. NAV that only varies
	 *    by 0.5%) from being amplified to look like wild oscillations.
	 */
	const yDomain = $derived.by<[number, number]>(() => {
		if (smoothed.length === 0) return [0, 1];
		let lo = Infinity;
		let hi = -Infinity;
		for (const pt of smoothed) {
			if (pt.y < lo) lo = pt.y;
			if (pt.y > hi) hi = pt.y;
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
		const mid = (lo + hi) / 2;
		const range = hi - lo;
		const expanded = Math.max(range * 3, Math.abs(mid) * 0.15, 1e-9);
		return [mid - expanded / 2, mid + expanded / 2];
	});
</script>

<div class="chart">
	<div class="chart-canvas">
		<div class="chart-canvas-inner">
			<LayerCake
				padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
				x="x"
				y="y"
				data={smoothed}
				{xDomain}
				{yDomain}
			>
				<Svg pointerEvents={false}>
					<PriceChartAreas badgeLabel={currentPrice} />
				</Svg>
			</LayerCake>
		</div>
	</div>

	{#if xLabels && xLabels.length > 0}
		<div class="chart-x-labels" aria-hidden="true">
			{#each xLabels as label}
				<span class="chart-x-label">{label}</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chart {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		height: 100%;
		min-height: 0;
		min-width: 0;
	}
	/* The flex:1 + min-height:0 chain can collapse on the first tick before
	 * LayerCake reads `clientHeight`. Wrap LayerCake in an absolute-positioned
	 * inner so it fills its parent's bounding box once the layout settles —
	 * works equally well for full-height (price chart) and fixed-height (NAV
	 * Growth, 160px) consumers. */
	.chart-canvas {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
	}
	.chart-canvas-inner {
		position: absolute;
		inset: 0;
	}
	.chart-x-labels {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		align-items: center;
		padding: 0 4px;
	}
	.chart-x-label {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.02em;
		text-align: center;
		color: var(--color-chart-axis);
	}
	.chart-x-label:first-child {
		text-align: left;
	}
	.chart-x-label:last-child {
		text-align: right;
	}
</style>
