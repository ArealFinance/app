<script lang="ts">
	import { getContext } from 'svelte';
	import { area, line, curveMonotoneX } from 'd3-shape';
	import type { Readable } from 'svelte/store';
	import type { ScaleLinear } from 'd3-scale';

	type Point = { x: number; y: number };

	type Ctx = {
		data: Readable<Point[]>;
		xScale: Readable<ScaleLinear<number, number>>;
		yScale: Readable<ScaleLinear<number, number>>;
		width: Readable<number>;
		height: Readable<number>;
	};
	const { data, xScale, yScale, width, height } = getContext<Ctx>('LayerCake');

	type Props = {
		/** Floating pill rendered at the last data point (e.g. current price). */
		badgeLabel?: string;
	};
	let { badgeLabel }: Props = $props();

	// A unique-ish suffix lets multiple PriceChart instances coexist on a page
	// without `<defs>` id collisions (NAV Growth + Price chart on the same screen).
	const uid = $props.id();

	const areaGen = $derived(
		area<Point>()
			.x((d) => $xScale(d.x))
			.y0(() => $height)
			.y1((d) => $yScale(d.y))
			.curve(curveMonotoneX)
	);

	const lineGen = $derived(
		line<Point>()
			.x((d) => $xScale(d.x))
			.y((d) => $yScale(d.y))
			.curve(curveMonotoneX)
	);

	// Vertical grid (21 columns) + horizontal grid (9 rows). Light hairlines
	// per Figma (rgba(255,255,255,0.05)).
	const verticalGrid = $derived(
		Array.from({ length: 21 }, (_, i) => ($width * i) / 20)
	);
	const horizontalGrid = $derived(
		Array.from({ length: 9 }, (_, i) => ($height * i) / 8)
	);

	const lastPoint = $derived($data[$data.length - 1]);
	const lastX = $derived(lastPoint ? $xScale(lastPoint.x) : 0);
	const lastY = $derived(lastPoint ? $yScale(lastPoint.y) : 0);

	// Badge geometry (matches Figma: 56×19 pill, 14px text, dark on green).
	const badgeW = 56;
	const badgeH = 19;
	const badgeGap = 8; // distance from line endpoint to pill left edge
	// Clamp so the pill never spills outside the chart on the right.
	const badgeX = $derived(Math.min(lastX + badgeGap, $width - badgeW));
	const badgeY = $derived(lastY - badgeH / 2);
</script>

<defs>
	<!-- Vertical area fade — main green wash -->
	<linearGradient id="grad-price-fill-{uid}" x1="0" x2="0" y1="0" y2="1">
		<stop offset="27%" stop-color="#AFFFB8" stop-opacity="0.2" />
		<stop offset="92%" stop-color="#AFFFB8" stop-opacity="0" />
	</linearGradient>

	<!-- Horizontal right-side glow concentrated near the current price.
	     Figma source has 91.48deg + matrix(-1,0,0,1) flip → effective gradient is
	     transparent (left) → #AFFFB8 (right). -->
	<linearGradient id="grad-price-fill-h-{uid}" x1="0" x2="1" y1="0" y2="0">
		<stop offset="0%" stop-color="#AFFFB8" stop-opacity="0" />
		<stop offset="100%" stop-color="#AFFFB8" stop-opacity="0.55" />
	</linearGradient>

	<!-- Clip the horizontal glow to the area shape so the band doesn't
	     leak above the line into empty space. -->
	<clipPath id="clip-price-area-{uid}">
		<path d={areaGen($data) ?? ''} />
	</clipPath>
</defs>

<!-- Grid -->
<g aria-hidden="true">
	{#each verticalGrid as x}
		<line {x} x1={x} x2={x} y1={0} y2={$height} stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" />
	{/each}
	{#each horizontalGrid as y}
		<line y1={y} y2={y} x1={0} x2={$width} stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" />
	{/each}
</g>

<!-- Area fill (main vertical fade) -->
<path d={areaGen($data) ?? ''} fill="url(#grad-price-fill-{uid})" />

<!-- Right-side horizontal glow, clipped to area, height-capped to top band per Figma -->
<g clip-path="url(#clip-price-area-{uid})">
	<rect x="0" y="0" width={$width} height={Math.max($height * 0.34, 92)} fill="url(#grad-price-fill-h-{uid})" />
</g>

<!-- Line stroke on top -->
<path
	d={lineGen($data) ?? ''}
	fill="none"
	stroke="#AFFFB8"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
/>

{#if badgeLabel && lastPoint}
	<!-- Pill badge anchored to the last data point. Dark text on solid green
	     per Figma (#73FF83 fill, #0D0A17 text). -->
	<g class="badge" transform="translate({badgeX}, {badgeY})">
		<rect width={badgeW} height={badgeH} rx={badgeH / 2} fill="#73FF83" />
		<text
			x={badgeW / 2}
			y={badgeH / 2}
			text-anchor="middle"
			dominant-baseline="middle"
			fill="#0D0A17"
			font-size="13"
			font-weight="600"
			font-family="'Inter', system-ui, sans-serif"
			letter-spacing="-0.4">{badgeLabel}</text
		>
	</g>
{/if}
