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
		<path d="M11.25 20a.75.75 0 0 0 1.5 0v-7.25H20a.75.75 0 0 0 0-1.5h-7.25V4a.75.75 0 0 0-1.5 0v7.25H4a.75.75 0 0 0 0 1.5h7.25z" />
	{:else if variant === 'light'}
		<path d="M11.5 20a.5.5 0 0 0 1 0v-7.5H20a.5.5 0 0 0 0-1h-7.5V4a.5.5 0 0 0-1 0v7.5H4a.5.5 0 0 0 0 1h7.5z" />
	{:else if variant === 'filled'}
		<path d="M11 20a1 1 0 1 0 2 0v-7h7a1 1 0 1 0 0-2h-7V4a1 1 0 1 0-2 0v7H4a1 1 0 1 0 0 2h7z" />
	{:else if variant === 'duotone'}
		<path d="M12 21a1 1 0 0 1-1-1V4a1 1 0 1 1 2 0v16a1 1 0 0 1-1 1" opacity=".4" />
		<path d="M21 12a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h16a1 1 0 0 1 1 1" />
	{:else if variant === 'duotone-line'}
		<path d="M12 20.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 1 0v16a.5.5 0 0 1-.5.5" opacity=".4" />
		<path d="M20.5 12a.5.5 0 0 1-.5.5H4a.5.5 0 0 1 0-1h16a.5.5 0 0 1 .5.5" />
	{/if}
</svg>
