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
		<path d="M7.53 8.53a.75.75 0 0 1-1.06-1.06l5-5a.75.75 0 0 1 1.06 0l5 5a.75.75 0 0 1-1.06 1.06l-3.72-3.72V21a.75.75 0 0 1-1.5 0V4.81z" />
	{:else if variant === 'light'}
		<path d="M7.354 8.354a.5.5 0 1 1-.708-.708l5-5a.5.5 0 0 1 .708 0l5 5a.5.5 0 0 1-.708.708L12.5 4.207V21a.5.5 0 0 1-1 0V4.207z" />
	{:else if variant === 'filled'}
		<path d="M7.707 8.707a1 1 0 0 1-1.414-1.414l5-5a1 1 0 0 1 1.414 0l5 5a1 1 0 0 1-1.414 1.414L13 5.414V21a1 1 0 1 1-2 0V5.414z" />
	{:else if variant === 'duotone'}
		<path d="M12 22a1 1 0 0 0 1-1V3.5a1 1 0 1 0-2 0V21a1 1 0 0 0 1 1" opacity=".4" />
		<path d="M6.293 8.707a1 1 0 0 0 1.414 0L12 4.414l4.293 4.293a1 1 0 1 0 1.414-1.414l-5-5a1 1 0 0 0-1.414 0l-5 5a1 1 0 0 0 0 1.414" />
	{:else if variant === 'duotone-line'}
		<path d="M12 21.5a.5.5 0 0 0 .5-.5V3.5a.5.5 0 0 0-1 0V21a.5.5 0 0 0 .5.5" opacity=".4" />
		<path d="M6.646 8.354a.5.5 0 0 0 .708 0L12 3.707l4.646 4.647a.5.5 0 0 0 .708-.708l-5-5a.5.5 0 0 0-.708 0l-5 5a.5.5 0 0 0 0 .708" />
	{/if}
</svg>
