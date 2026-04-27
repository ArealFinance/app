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
	{#if variant === 'regular'}
		<path d="M8.53 7.53a.75.75 0 0 0-1.06-1.06l-5 5a.75.75 0 0 0 0 1.06l5 5a.75.75 0 0 0 1.06-1.06l-3.72-3.72H21a.75.75 0 0 0 0-1.5H4.81z" />
	{:else if variant === 'light'}
		<path d="M8.354 7.354a.5.5 0 1 0-.708-.708l-5 5a.5.5 0 0 0 0 .708l5 5a.5.5 0 0 0 .708-.708L4.207 12.5H21a.5.5 0 0 0 0-1H4.207z" />
	{:else if variant === 'filled'}
		<path d="M8.707 7.707a1 1 0 0 0-1.414-1.414l-5 5a1 1 0 0 0 0 1.414l5 5a1 1 0 0 0 1.414-1.414L5.414 13H21a1 1 0 1 0 0-2H5.414z" />
	{:else if variant === 'duotone'}
		<path d="M22 12a1 1 0 0 1-1 1H3.5a1 1 0 1 1 0-2H21a1 1 0 0 1 1 1" opacity=".4" />
		<path d="M8.707 6.293a1 1 0 0 1 0 1.414L4.414 12l4.293 4.293a1 1 0 1 1-1.414 1.414l-5-5a1 1 0 0 1 0-1.414l5-5a1 1 0 0 1 1.414 0" />
	{:else if variant === 'duotone-line'}
		<path d="M21.5 12a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1 0-1H21a.5.5 0 0 1 .5.5" opacity=".4" />
		<path d="M8.354 6.646a.5.5 0 0 1 0 .708L3.707 12l4.647 4.646a.5.5 0 0 1-.708.708l-5-5a.5.5 0 0 1 0-.708l5-5a.5.5 0 0 1 .708 0" />
	{/if}
</svg>
