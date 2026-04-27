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
		<path d="M2.75 2a.75.75 0 0 0-1.5 0v16.5a4.25 4.25 0 0 0 4.25 4.25H22a.75.75 0 0 0 0-1.5H5.5a2.75 2.75 0 0 1-2.75-2.75z" />
		<path d="M21.53 8.53a.75.75 0 0 0-1.06-1.06l-4.97 4.97-3.47-3.47a.75.75 0 0 0-1.06 0l-5.5 5.5a.75.75 0 1 0 1.06 1.06l4.97-4.97 3.47 3.47a.75.75 0 0 0 1.06 0z" />
	{:else if variant === 'light'}
		<path d="M2.5 2a.5.5 0 0 0-1 0v16.5a4 4 0 0 0 4 4H22a.5.5 0 0 0 0-1H5.5a3 3 0 0 1-3-3z" />
		<path d="M21.354 8.354a.5.5 0 0 0-.708-.708L15.5 12.793l-3.646-3.647a.5.5 0 0 0-.708 0l-5.5 5.5a.5.5 0 0 0 .708.708l5.146-5.147 3.646 3.647a.5.5 0 0 0 .708 0z" />
	{:else if variant === 'filled'}
		<path d="M3 2a1 1 0 0 0-2 0v16.5A4.5 4.5 0 0 0 5.5 23H22a1 1 0 1 0 0-2H5.5A2.5 2.5 0 0 1 3 18.5z" />
		<path d="M21.707 8.707a1 1 0 0 0-1.414-1.414L15.5 12.086l-3.293-3.293a1 1 0 0 0-1.414 0l-5.5 5.5a1 1 0 1 0 1.414 1.414l4.793-4.793 3.293 3.293a1 1 0 0 0 1.414 0z" />
	{:else if variant === 'duotone'}
		<path d="M2 1a1 1 0 0 1 1 1v16.5A2.5 2.5 0 0 0 5.5 21H22a1 1 0 1 1 0 2H5.5A4.5 4.5 0 0 1 1 18.5V2a1 1 0 0 1 1-1" opacity=".4" />
		<path d="M21.707 7.293a1 1 0 0 1 0 1.414l-5.5 5.5a1 1 0 0 1-1.414 0L11.5 10.914l-4.793 4.793a1 1 0 0 1-1.414-1.414l5.5-5.5a1 1 0 0 1 1.414 0l3.293 3.293 4.793-4.793a1 1 0 0 1 1.414 0" />
	{:else if variant === 'duotone-line'}
		<path fill-rule="evenodd" d="M21.5 8a.5.5 0 0 0-.853-.353L15.5 12.793l-3.646-3.646a.5.5 0 0 0-.708 0l-3.8 3.8-5.598 5.599a.5.5 0 0 0-.134.465A4.5 4.5 0 0 0 6 22.501h15a.5.5 0 0 0 .5-.5zM11.146 9.147l.354.353z" clip-rule="evenodd" opacity=".4" />
		<path d="M2.5 2a.5.5 0 0 0-1 0v16.5a4 4 0 0 0 4 4H22a.5.5 0 0 0 0-1H5.5a3 3 0 0 1-3-3z" />
		<path d="M21.354 8.354a.5.5 0 0 0-.708-.708L15.5 12.793l-3.646-3.647a.5.5 0 0 0-.708 0l-5.5 5.5a.5.5 0 0 0 .708.708l5.146-5.147 3.646 3.647a.5.5 0 0 0 .708 0z" />
	{/if}
</svg>
