<script lang="ts" module>
	export type ChartVariant = 'line' | 'area' | 'sparkline';
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { chartPoints, chartLinePath, chartAreaPath } from '$lib/utils/chart';

	type Props = {
		data: number[];
		variant?: ChartVariant;
		width?: number | string;
		height?: number | string;
		strokeWidth?: number;
		color?: string;
		fillOpacity?: number;
		preserveAspectRatio?: string;
	} & Omit<HTMLAttributes<SVGSVGElement>, 'children'>;

	let {
		data,
		variant = 'line',
		width = '100%',
		height = '100%',
		strokeWidth = 2,
		color = 'var(--color-success)',
		fillOpacity = 0.18,
		preserveAspectRatio = 'none',
		class: className = '',
		...rest
	}: Props = $props();

	const W = 100;
	const H = 100;
	const box = { width: W, height: H };

	const points = $derived(chartPoints(data, box));
	const linePath = $derived(chartLinePath(points));
	const areaPath = $derived(chartAreaPath(points, box));

	const isSparkline = $derived(variant === 'sparkline');
	const effectiveStroke = $derived(isSparkline ? Math.min(strokeWidth, 1.5) : strokeWidth);
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 {W} {H}"
	{width}
	{height}
	{preserveAspectRatio}
	class={className}
	aria-hidden="true"
	focusable="false"
	{...rest}
>
	{#if variant === 'area'}
		<path d={areaPath} fill={color} fill-opacity={fillOpacity} stroke="none" />
		<path
			d={linePath}
			fill="none"
			stroke={color}
			stroke-width={effectiveStroke}
			stroke-linejoin="round"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
		/>
	{:else}
		<path
			d={linePath}
			fill="none"
			stroke={color}
			stroke-width={effectiveStroke}
			stroke-linejoin="round"
			stroke-linecap="round"
			vector-effect="non-scaling-stroke"
		/>
	{/if}
</svg>
