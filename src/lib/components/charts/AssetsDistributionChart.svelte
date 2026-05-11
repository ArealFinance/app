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

	// Resolution of the waveform along the X axis. 60 samples is enough to
	// keep the monotonic-X curve smooth without burning DOM size.
	const SAMPLES = 60;

	// Subtle vertical wobble applied to ALL band boundaries equally so the
	// shape feels alive without ever crossing — adjacent bands share the
	// same wobbled boundary line.
	const WOBBLE_AMP = 0.05; // 5% of chart height

	type Sample = { x: number; offset: number };
	const samples = $derived<Sample[]>(
		Array.from({ length: SAMPLES }, (_, i) => {
			const t = i / (SAMPLES - 1);
			// Two superposed sines + linear taper give a "breathing" wave
			// that flares wider on the left and tapers right (matches the
			// old design language but without the crisscross).
			const wave =
				Math.sin(t * Math.PI * 2.2) * 0.6 + Math.sin(t * Math.PI * 4.8) * 0.4;
			const taper = 1 - t * 0.55; // narrows toward the right
			return {
				x: LEFT_PAD + t * INNER_W,
				offset: wave * WOBBLE_AMP * taper
			};
		})
	);

	// Pre-compute the cumulative fraction at which each band STARTS (top
	// edge) — these are the at-rest boundaries. The wobble shifts every
	// boundary together so the bands stay non-overlapping.
	type Band = AssetsDistributionBucket & { top: number; bot: number };
	const bands = $derived.by<Band[]>(() => {
		const out: Band[] = [];
		let acc = 0;
		for (const b of buckets) {
			const next = acc + Math.max(0, b.pct);
			out.push({ ...b, top: acc, bot: next });
			acc = next;
		}
		return out;
	});

	const areaGen = $derived(
		area<{ x: number; y0: number; y1: number }>()
			.x((d) => d.x)
			.y0((d) => d.y0)
			.y1((d) => d.y1)
			.curve(curveMonotoneX)
	);

	function pathFor(band: Band): string {
		// Center the wobble between the band's top/bot anchors. A single
		// shared offset per sample keeps neighbouring bands sealed
		// against each other — no gap, no overlap.
		const pts = samples.map((s) => ({
			x: s.x,
			y0: H * (band.top + s.offset),
			y1: H * (band.bot + s.offset)
		}));
		return areaGen(pts) ?? '';
	}

	// Start-pill geometry: thin vertical bars hugged to x=0, height
	// proportional to band's pct (so a 5/6 — 1/6 split makes the purple
	// pill clearly taller than the pink one).
	function pillY(band: Band): { y: number; h: number } {
		const padding = 0.04; // 4% breathing room
		const top = H * (band.top + padding);
		const bot = H * (band.bot - padding);
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
