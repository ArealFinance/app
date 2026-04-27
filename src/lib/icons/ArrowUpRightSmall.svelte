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
		<path d="M19 4.25a.75.75 0 0 1 .75.75v8a.75.75 0 0 1-1.5 0V6.81L5.53 19.53a.75.75 0 0 1-1.06-1.06L17.19 5.75H11a.75.75 0 0 1 0-1.5z" />
	{:else if variant === 'light'}
		<path d="M19 4.5a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-1 0V6.207L5.354 19.354a.5.5 0 0 1-.708-.708L17.793 5.5H11a.5.5 0 0 1 0-1z" />
	{:else if variant === 'filled'}
		<path d="M19 4a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V7.414L5.707 19.707a1 1 0 0 1-1.414-1.414L16.586 6H11a1 1 0 1 1 0-2z" />
	{:else if variant === 'duotone'}
		<path d="M19.207 4.793a1 1 0 0 0-1.414 0l-13.5 13.5a1 1 0 1 0 1.414 1.414l13.5-13.5a1 1 0 0 0 0-1.414" opacity=".4" />
		<path d="M20 5a1 1 0 0 0-1-1h-8a1 1 0 1 0 0 2h7v7a1 1 0 1 0 2 0z" />
	{:else if variant === 'duotone-line'}
		<path d="M18.854 5.146a.5.5 0 0 0-.708 0l-13.5 13.5a.5.5 0 0 0 .708.708l13.5-13.5a.5.5 0 0 0 0-.708" opacity=".4" />
		<path d="M19.5 5a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0 0 1h7.5V13a.5.5 0 0 0 1 0z" />
	{/if}
</svg>
