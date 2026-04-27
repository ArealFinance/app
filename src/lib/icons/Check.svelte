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
		<path d="M21.53 5.47a.75.75 0 0 1 0 1.06l-12 12a.75.75 0 0 1-1.06 0l-6-6a.75.75 0 1 1 1.06-1.06L9 16.94 20.47 5.47a.75.75 0 0 1 1.06 0" />
	{:else if variant === 'light'}
		<path d="M21.354 5.646a.5.5 0 0 1 0 .708l-12 12a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 .708-.708L9 17.293 20.646 5.646a.5.5 0 0 1 .708 0" />
	{:else if variant === 'filled'}
		<path d="M21.707 5.293a1 1 0 0 1 0 1.414l-12 12a1 1 0 0 1-1.414 0l-6-6a1 1 0 1 1 1.414-1.414L9 16.586 20.293 5.293a1 1 0 0 1 1.414 0" />
	{:else if variant === 'duotone'}
		<path d="M21.707 5.293a1 1 0 0 1 0 1.414l-12 12a1 1 0 0 1-1.414 0l-6-6a1 1 0 1 1 1.414-1.414L9 16.586 20.293 5.293a1 1 0 0 1 1.414 0" opacity=".4" />
	{:else if variant === 'duotone-line'}
		<path d="M21.354 5.646a.5.5 0 0 1 0 .708l-12 12a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 .708-.708L9 17.293 20.646 5.646a.5.5 0 0 1 .708 0" opacity=".4" />
	{/if}
</svg>
