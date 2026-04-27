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
		<path d="M18.47 19.53a.75.75 0 1 0 1.06-1.06L13.06 12l6.47-6.47a.75.75 0 0 0-1.06-1.06L12 10.94 5.53 4.47a.75.75 0 0 0-1.06 1.06L10.94 12l-6.47 6.47a.75.75 0 1 0 1.06 1.06L12 13.06z" />
	{:else if variant === 'light'}
		<path d="M18.646 19.354a.5.5 0 0 0 .708-.708L12.707 12l6.647-6.646a.5.5 0 0 0-.708-.708L12 11.293 5.354 4.646a.5.5 0 1 0-.708.708L11.293 12l-6.647 6.646a.5.5 0 0 0 .708.708L12 12.707z" />
	{:else if variant === 'filled'}
		<path d="M18.293 19.707a1 1 0 0 0 1.414-1.414L13.414 12l6.293-6.293a1 1 0 0 0-1.414-1.414L12 10.586 5.707 4.293a1 1 0 0 0-1.414 1.414L10.586 12l-6.293 6.293a1 1 0 1 0 1.414 1.414L12 13.414z" />
	{:else if variant === 'duotone'}
		<path d="M19.707 19.707a1 1 0 0 1-1.414 0l-14-14a1 1 0 0 1 1.414-1.414l14 14a1 1 0 0 1 0 1.414" opacity=".4" />
		<path d="M19.707 4.293a1 1 0 0 1 0 1.414l-14 14a1 1 0 0 1-1.414-1.414l14-14a1 1 0 0 1 1.414 0" />
	{:else if variant === 'duotone-line'}
		<path d="M19.354 19.354a.5.5 0 0 1-.708 0l-14-14a.5.5 0 1 1 .708-.708l14 14a.5.5 0 0 1 0 .708" opacity=".4" />
		<path d="M19.354 4.646a.5.5 0 0 1 0 .708l-14 14a.5.5 0 0 1-.708-.708l14-14a.5.5 0 0 1 .708 0" />
	{/if}
</svg>
