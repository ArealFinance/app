<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	type Variant = 'light' | 'regular' | 'filled' | 'duotone' | 'duotone-line';

	type Props = {
		size?: number | string;
		variant?: Variant;
		color?: string;
	} & Omit<HTMLAttributes<SVGSVGElement>, 'children'>;

	let {
		size = 24,
		variant = 'regular',
		color = 'currentColor',
		class: className = '',
		...rest
	}: Props = $props();

	// "Rest of pie" silhouette (duotone backdrop), local viewBox 11.98 × 15.62.
	const REST_OF_PIE =
		'M6.9795 0.0019C7.1707 -0.0188 7.3333 0.1342 7.3333 0.3266V7.7874C7.3333 7.7908 7.3333 7.7941 7.3334 7.7975C7.3351 7.901 7.369 8.0035 7.4336 8.0895L11.916 14.0568C12.0315 14.2105 11.9936 14.4305 11.8282 14.5287C10.6585 15.2236 9.2925 15.6226 7.8333 15.6226C3.5071 15.6226 0 12.1155 0 7.7892C0 3.7515 3.0549 0.4273 6.9795 0.0019Z';

	// Highlighted wedge — top fan (path 1), local viewBox 7.29 × 13.59.
	const WEDGE_TOP =
		'M0.3538 0.0019C0.1625 -0.0188 0 0.1342 0 0.3266V6.9559C0 7.14 0.1492 7.2892 0.3333 7.2892H6.9626C7.155 7.2892 7.3081 7.1267 7.2873 6.9355C6.8923 3.2913 3.998 0.3969 0.3538 0.0019Z';
	// Highlighted wedge — bottom fan (path 2).
	const WEDGE_BOTTOM =
		'M6.9626 8.2892C7.155 8.2892 7.3081 8.4518 7.2873 8.643C7.0804 10.5524 6.1872 12.256 4.8596 13.502C4.7192 13.6338 4.4971 13.6091 4.3815 13.4552L0.9017 8.8228C0.7367 8.603 0.8934 8.2892 1.1682 8.2892H6.9626Z';
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill={color}
	class={className}
	aria-hidden="true"
	focusable="false"
	{...rest}
>
	{#if variant === 'duotone'}
		<g transform="scale(1.5)">
			<g transform="translate(0.17 0.21)">
				<path d={REST_OF_PIE} opacity="0.4" />
			</g>
			<g transform="translate(8.5 0.21)">
				<path d={WEDGE_TOP} />
				<path d={WEDGE_BOTTOM} />
			</g>
		</g>
	{:else if variant === 'duotone-line'}
		<g transform="scale(1.5)">
			<g transform="translate(0.17 0.21)">
				<path d={REST_OF_PIE} />
			</g>
			<g transform="translate(8.5 0.21)" opacity="0.4">
				<path d={WEDGE_TOP} />
				<path d={WEDGE_BOTTOM} />
			</g>
		</g>
	{:else}
		<g transform="scale(1.5)">
			<g transform="translate(0.17 0.21)">
				<path d={REST_OF_PIE} />
			</g>
			<g transform="translate(8.5 0.21)">
				<path d={WEDGE_TOP} />
				<path d={WEDGE_BOTTOM} />
			</g>
		</g>
	{/if}
</svg>
