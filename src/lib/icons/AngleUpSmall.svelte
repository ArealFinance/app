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
		<path d="M6.47 14.53a.75.75 0 0 0 1.06 0L12 10.06l4.47 4.47a.75.75 0 1 0 1.06-1.06l-5-5a.75.75 0 0 0-1.06 0l-5 5a.75.75 0 0 0 0 1.06" />
	{:else if variant === 'light'}
		<path d="M6.646 14.354a.5.5 0 0 0 .708 0L12 9.707l4.646 4.647a.5.5 0 0 0 .708-.708l-5-5a.5.5 0 0 0-.708 0l-5 5a.5.5 0 0 0 0 .708" />
	{:else if variant === 'filled'}
		<path d="M6.293 14.707a1 1 0 0 0 1.414 0L12 10.414l4.293 4.293a1 1 0 0 0 1.414-1.414l-5-5a1 1 0 0 0-1.414 0l-5 5a1 1 0 0 0 0 1.414" />
	{:else if variant === 'duotone'}
		<path d="M6.293 14.707a1 1 0 0 0 1.414 0L12 10.414l4.293 4.293a1 1 0 0 0 1.414-1.414l-5-5a1 1 0 0 0-1.414 0l-5 5a1 1 0 0 0 0 1.414" opacity=".4" />
	{:else if variant === 'duotone-line'}
		<path d="M6.646 14.354a.5.5 0 0 0 .708 0L12 9.707l4.646 4.647a.5.5 0 0 0 .708-.708l-5-5a.5.5 0 0 0-.708 0l-5 5a.5.5 0 0 0 0 .708" opacity=".4" />
	{/if}
</svg>
