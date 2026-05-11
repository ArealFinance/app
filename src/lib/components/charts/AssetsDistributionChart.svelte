<script lang="ts" module>
	export type AssetsDistributionBucket = {
		/** Stable identity for the keyed `{#each}` (e.g. category id). */
		key: string;
		/** Fraction of the chart's vertical space this bucket occupies (0..1). */
		pct: number;
		/** Fill colour. CSS colour string. */
		color: string;
	};
</script>

<script lang="ts">
	import { area, curveMonotoneX } from 'd3-shape';

	type Props = {
		/**
		 * Real-data buckets, ordered top-to-bottom. Each one stacks below
		 * the previous so heights are strictly proportional to `pct` and
		 * no two bands overlap.
		 *
		 * Defaults to a 60/40 demo split for Storybook / autodoc renders.
		 */
		buckets?: AssetsDistributionBucket[];
		/** Show a vertical 'current' marker on the right edge. */
		showMarker?: boolean;
		/** Chart height (CSS px). */
		height?: number;
	};

	let {
		buckets = [
			{ key: 'a', pct: 0.6, color: '#A78BFA' },
			{ key: 'b', pct: 0.4, color: '#F472B6' }
		],
		showMarker = true,
		height = 140
	}: Props = $props();

	// Internal SVG viewBox — pixel-agnostic; CSS scales to fit the wrapper.
	const W = 600;
	const H = 140;
	const LEFT_PAD = 14; // px reserved for the start pills on the left edge
	const RIGHT_PAD = 8;
	const INNER_W = W - LEFT_PAD - RIGHT_PAD;

	// Resolution of the waveform along the X axis. 60 samples keeps the
	// monotonic-X curve smooth without exploding DOM size.
	const SAMPLES = 60;

	// Two per-band fractions:
	//   leftPct  = 1/N for every band  (each source is one slot at the
	//             left — "I exist", regardless of yield)
	//   rightPct = bucket.pct          (its share of total VALUE on the
	//             right — proportional flow)
	// The band's top/bot edges lerp between these two distributions
	// across X so the shape READS as "equal sources → proportional
	// outcomes". Adjacent bands share the same boundary at every X so
	// they never overlap and never gap.
	type Band = AssetsDistributionBucket & {
		leftTop: number;
		leftBot: number;
		rightTop: number;
		rightBot: number;
	};
	const bands = $derived.by<Band[]>(() => {
		const N = Math.max(1, buckets.length);
		const left = 1 / N;
		const out: Band[] = [];
		let leftAcc = 0;
		let rightAcc = 0;
		for (const b of buckets) {
			const leftNext = leftAcc + left;
			const rightNext = rightAcc + Math.max(0, b.pct);
			out.push({
				...b,
				leftTop: leftAcc,
				leftBot: leftNext,
				rightTop: rightAcc,
				rightBot: rightNext
			});
			leftAcc = leftNext;
			rightAcc = rightNext;
		}
		return out;
	});

	// Smoothstep so the lerp accelerates then decelerates — looks more
	// "fluid" than a linear shift between left and right distributions.
	function smoothstep(t: number): number {
		return t * t * (3 - 2 * t);
	}

	const areaGen = $derived(
		area<{ x: number; y0: number; y1: number }>()
			.x((d) => d.x)
			.y0((d) => d.y0)
			.y1((d) => d.y1)
			.curve(curveMonotoneX)
	);

	function pathFor(band: Band): string {
		const pts = Array.from({ length: SAMPLES }, (_, i) => {
			const t = i / (SAMPLES - 1);
			const e = smoothstep(t);
			const top = band.leftTop + (band.rightTop - band.leftTop) * e;
			const bot = band.leftBot + (band.rightBot - band.leftBot) * e;
			return {
				x: LEFT_PAD + t * INNER_W,
				y0: H * top,
				y1: H * bot
			};
		});
		return areaGen(pts) ?? '';
	}

	// Start-pill geometry: equal-height bars at x=0 (one slot per source,
	// matching the LEFT edge of the chart where every band has the same
	// share). 4% inset top/bot for breathing room.
	function pillY(band: Band): { y: number; h: number } {
		const padding = 0.04;
		const top = H * (band.leftTop + padding);
		const bot = H * (band.leftBot - padding);
		return { y: top, h: Math.max(2, bot - top) };
	}

	const markerX = W - RIGHT_PAD / 2;
</script>

<div class="chart" style:--h="{height}px">
	<svg
		viewBox="0 0 {W} {H}"
		preserveAspectRatio="none"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
	>
		<defs>
			{#each bands as band (band.key)}
				<linearGradient id="grad-{band.key}" x1="0" x2="1" y1="0" y2="0">
					<stop offset="0%" stop-color={band.color} stop-opacity="0.9" />
					<stop offset="100%" stop-color={band.color} stop-opacity="0.55" />
				</linearGradient>
			{/each}
		</defs>

		<!-- Stacked bands. Each is non-overlapping; the gradient gives the
		     same "flaring on the left, tapering right" feel as the prior
		     mock without the crisscross. -->
		{#each bands as band (band.key)}
			<path d={pathFor(band)} fill="url(#grad-{band.key})" />
		{/each}

		<!-- Start pills: solid bars at x=0, proportional to each band. -->
		{#each bands as band (band.key)}
			{@const p = pillY(band)}
			<rect x="0" y={p.y} width="6" height={p.h} rx="3" fill={band.color} />
		{/each}

		{#if showMarker}
			<line
				x1={markerX}
				x2={markerX}
				y1={H * 0.06}
				y2={H * 0.94}
				stroke="rgba(255, 255, 255, 0.85)"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		{/if}
	</svg>
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		height: var(--h);
	}
	.chart svg {
		width: 100%;
		height: 100%;
		display: block;
	}
</style>
