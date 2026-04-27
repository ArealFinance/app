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
		<path d="M7.53 15.47a.75.75 0 0 0-1.06 1.06l5 5a.75.75 0 0 0 1.06 0l5-5a.75.75 0 1 0-1.06-1.06l-3.72 3.72V3a.75.75 0 0 0-1.5 0v16.19z" />
	{:else if variant === 'light'}
		<path d="M7.354 15.646a.5.5 0 0 0-.708.708l5 5a.5.5 0 0 0 .708 0l5-5a.5.5 0 0 0-.708-.708L12.5 19.793V3a.5.5 0 0 0-1 0v16.793z" />
	{:else if variant === 'filled'}
		<path d="M7.707 15.293a1 1 0 0 0-1.414 1.414l5 5a1 1 0 0 0 1.414 0l5-5a1 1 0 0 0-1.414-1.414L13 18.586V3a1 1 0 1 0-2 0v15.586z" />
	{:else if variant === 'duotone'}
		<path d="M12 2a1 1 0 0 1 1 1v17.5a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1" opacity=".4" />
		<path d="M6.293 15.293a1 1 0 0 1 1.414 0L12 19.586l4.293-4.293a1 1 0 0 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414" />
	{:else if variant === 'duotone-line'}
		<path d="M12 2.5a.5.5 0 0 1 .5.5v17.5a.5.5 0 0 1-1 0V3a.5.5 0 0 1 .5-.5" opacity=".4" />
		<path d="M6.646 15.646a.5.5 0 0 1 .708 0L12 20.293l4.646-4.647a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708 0l-5-5a.5.5 0 0 1 0-.708" />
	{/if}
</svg>
