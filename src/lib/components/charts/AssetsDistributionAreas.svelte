<script lang="ts">
	import { getContext } from 'svelte';
	import { area, curveMonotoneX } from 'd3-shape';
	import type { Readable } from 'svelte/store';
	import type { ScaleLinear } from 'd3-scale';
	import type { AssetsDistributionPoint } from './AssetsDistributionChart.svelte';

	type Props = {
		showMarker?: boolean;
	};

	let { showMarker = true }: Props = $props();

	type Ctx = {
		data: Readable<AssetsDistributionPoint[]>;
		xScale: Readable<ScaleLinear<number, number>>;
		width: Readable<number>;
		height: Readable<number>;
		xDomain: Readable<[number, number]>;
	};
	const { data, xScale, width, height, xDomain } = getContext<Ctx>('LayerCake');

	// Each ribbon is an area path with INDEPENDENT top + bot edges. Both
	// ribbons start full-height on the left (purple 0..0.5, pink 0.5..1)
	// and CONVERGE toward a shared central band on the right, where their
	// fill-opacity blends them into one merged stripe.

	// Reserve space for the decorative left pills + right marker. Ribbons
	// occupy the inner range so they don't visually start at x=0.
	const leftPad = 14; // px, room for the start pills
	const rightPad = 8; // px, breathing room before the right marker

	const ownershipArea = $derived(
		area<AssetsDistributionPoint>()
			.x((d) => leftPad + ($xScale(d.x) / $width) * Math.max(0, $width - leftPad - rightPad))
			.y0((d) => $height * d.ownershipTop)
			.y1((d) => $height * d.ownershipBot)
			.curve(curveMonotoneX)
	);

	const lpAreaGen = $derived(
		area<AssetsDistributionPoint>()
			.x((d) => leftPad + ($xScale(d.x) / $width) * Math.max(0, $width - leftPad - rightPad))
			.y0((d) => $height * d.lpTop)
			.y1((d) => $height * d.lpBot)
			.curve(curveMonotoneX)
	);

	// Decorative starting pills — placed at x=0 of the chart, vertically
	// centred on each ribbon's at-rest mid-band. Fixed visual size (40% of
	// chart height each) so they read as deliberate markers, not as a
	// continuation of the ribbon's silhouette.
	const ownershipPill = $derived({
		cy: $height * 0.25,
		thickness: $height * 0.4
	});
	const lpPill = $derived({
		cy: $height * 0.75,
		thickness: $height * 0.4
	});

	const markerX = $derived($width - rightPad / 2);
</script>

<defs>
	<linearGradient id="grad-ownership" x1="0" x2="1" y1="0" y2="0">
		<stop offset="0%" stop-color="#A78BFA" stop-opacity="0.9" />
		<stop offset="100%" stop-color="#7C5CFF" stop-opacity="0.6" />
	</linearGradient>
	<linearGradient id="grad-lp" x1="0" x2="1" y1="0" y2="0">
		<stop offset="0%" stop-color="#F472B6" stop-opacity="0.9" />
		<stop offset="100%" stop-color="#9D2EAA" stop-opacity="0.6" />
	</linearGradient>
</defs>

<!-- Ribbons. fill-opacity below 1 so the overlap zone blends both colours
     where the ribbons cross. -->
<path d={ownershipArea($data) ?? ''} fill="url(#grad-ownership)" fill-opacity="0.85" />
<path d={lpAreaGen($data) ?? ''} fill="url(#grad-lp)" fill-opacity="0.85" />

<!-- Decorative starting pills, solid fill, hugged against x=0. -->
<rect
	x="0"
	y={ownershipPill.cy - ownershipPill.thickness / 2}
	width="6"
	height={ownershipPill.thickness}
	rx="3"
	fill="#A78BFA"
/>
<rect
	x="0"
	y={lpPill.cy - lpPill.thickness / 2}
	width="6"
	height={lpPill.thickness}
	rx="3"
	fill="#F472B6"
/>

{#if showMarker}
	<line
		x1={markerX}
		x2={markerX}
		y1={$height * 0.06}
		y2={$height * 0.94}
		stroke="rgba(255, 255, 255, 0.85)"
		stroke-width="1.5"
		stroke-linecap="round"
	/>
{/if}
