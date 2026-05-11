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

	// Internal SVG viewBox — sized to the Figma frame (420 × 239) so the
	// pill/marker pixel measurements transfer 1:1. CSS scales the whole
	// thing to whatever wrapper width the page provides.
	const W = 420;
	const H = 239;

	// Figma anchors (Group 2087330682 → Rectangles 5218/5220/5223):
	//   - Two left pills: 13×88 px, color #A56EFF / #D844C6, top 21 + 113
	//   - Right marker: 2×180 px, color #FBF2FF, top 21, at right edge
	//   - Bands occupy x = 15.58 → 417.58 (≈ 402 px inner width)
	const LEFT_PAD = 15.58;
	const RIGHT_PAD = W - 417.58; // ≈ 2.42 px so marker sits at x=418
	const INNER_W = W - LEFT_PAD - RIGHT_PAD;
	const PILL_W = 13;
	const PILL_RADIUS = 2.5974;
	const MARKER_W = 2;
	const MARKER_H = 180;
	const MARKER_TOP = 21;
	const PILL_H = 88;
	const PILL_TOP = 21;
	const PILL_GAP = 4; // distance between the two pills (113 - (21+88))

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

	// Start-pill geometry — exact Figma values when there are 2 sources.
	// For N > 2 (rare in current data shape) we distribute the same total
	// pill block evenly, preserving the equal-share-per-source semantics
	// the left edge represents.
	function pillY(_band: Band, index: number, total: number): { y: number; h: number } {
		const blockTop = PILL_TOP;
		const blockH = total * PILL_H + (total - 1) * PILL_GAP;
		const slotH = (blockH - (total - 1) * PILL_GAP) / total;
		return {
			y: blockTop + index * (slotH + PILL_GAP),
			h: slotH
		};
	}

	const markerX = W - RIGHT_PAD - MARKER_W / 2;
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

		<!-- Start pills: solid bars at x=0, equal-height (one slot per
		     source). Figma Group 2087330682 → Rectangles 5218/5220 spec:
		     13 × 88 px, radius 2.5974. -->
		{#each bands as band, i (band.key)}
			{@const p = pillY(band, i, bands.length)}
			<rect
				x="0"
				y={p.y}
				width={PILL_W}
				height={p.h}
				rx={PILL_RADIUS}
				fill={band.color}
			/>
		{/each}

		{#if showMarker}
			<!-- Right marker: solid 2×180 px white_900 rectangle (Figma
			     Rectangle 5223). -->
			<rect
				x={markerX - MARKER_W / 2}
				y={MARKER_TOP}
				width={MARKER_W}
				height={MARKER_H}
				rx={PILL_RADIUS}
				fill="#FBF2FF"
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
