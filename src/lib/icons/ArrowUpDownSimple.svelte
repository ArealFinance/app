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

	// Up arrow path (left side), in local viewBox 5.33333 x 12, scaled 1.5× and translated to (2, 1) within 24×24.
	const UP_PATH =
		'M0.195262 5.13809C-0.0650874 4.87774 -0.0650873 4.45563 0.195262 4.19528L4.19526 0.195281C4.38593 0.00461634 4.67267 -0.052421 4.92179 0.0507666C5.17091 0.153954 5.33333 0.397045 5.33333 0.666686L5.33333 11.3334C5.33333 11.7015 5.03486 12 4.66667 12C4.29848 12 4 11.7015 4 11.3334L4 2.27616L1.13807 5.13809C0.877721 5.39844 0.455611 5.39844 0.195262 5.13809Z';

	// Down arrow path (right side), in local viewBox 5.33333 x 12, scaled 1.5× and translated to (14, 5) within 24×24.
	const DOWN_PATH =
		'M5.13807 6.86193C5.39842 7.12228 5.39842 7.54439 5.13807 7.80474L1.13807 11.8047C0.947406 11.9954 0.66066 12.0524 0.411544 11.9493C0.162428 11.8461 0 11.603 0 11.3333L0 0.666666C0 0.298477 0.298478 0 0.666668 0C1.03486 0 1.33333 0.298477 1.33333 0.666666L1.33333 9.72386L4.19526 6.86193C4.45561 6.60158 4.87772 6.60158 5.13807 6.86193Z';
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
	<!--
		The Figma `arrow-up-down-simple` is rendered inside the Swap pill with a
		`rotate(90) + scale-x(-1)` transform around centre. We bake the same
		transform into the icon so it ships ready-to-use as a vertical up-down pair.
	-->
	<g transform="rotate(90 12 12) translate(12 12) scale(-1 1) translate(-12 -12)">
		{#if variant === 'duotone'}
			<g transform="translate(2 1) scale(1.5)">
				<path d={UP_PATH} />
			</g>
			<g transform="translate(14 5) scale(1.5)">
				<path d={DOWN_PATH} opacity="0.4" />
			</g>
		{:else if variant === 'duotone-line'}
			<g transform="translate(2 1) scale(1.5)" opacity="0.4">
				<path d={UP_PATH} />
			</g>
			<g transform="translate(14 5) scale(1.5)">
				<path d={DOWN_PATH} />
			</g>
		{:else}
			<g transform="translate(2 1) scale(1.5)">
				<path d={UP_PATH} />
			</g>
			<g transform="translate(14 5) scale(1.5)">
				<path d={DOWN_PATH} />
			</g>
		{/if}
	</g>
</svg>
