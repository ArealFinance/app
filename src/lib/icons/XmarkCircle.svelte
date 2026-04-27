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
		<path d="M15.53 15.53a.75.75 0 0 1-1.06 0L12 13.06l-2.47 2.47a.75.75 0 0 1-1.06-1.06L10.94 12 8.47 9.53a.75.75 0 0 1 1.06-1.06L12 10.94l2.47-2.47a.75.75 0 1 1 1.06 1.06L13.06 12l2.47 2.47a.75.75 0 0 1 0 1.06" />
		<path fill-rule="evenodd" d="M.25 12C.25 5.51 5.51.25 12 .25S23.75 5.51 23.75 12 18.49 23.75 12 23.75.25 18.49.25 12M12 1.75C6.34 1.75 1.75 6.34 1.75 12S6.34 22.25 12 22.25 22.25 17.66 22.25 12 17.66 1.75 12 1.75" clip-rule="evenodd" />
	{:else if variant === 'light'}
		<path d="M15.354 15.354a.5.5 0 0 1-.708 0L12 12.707l-2.646 2.647a.5.5 0 0 1-.708-.708L11.293 12 8.646 9.354a.5.5 0 1 1 .708-.708L12 11.293l2.646-2.647a.5.5 0 1 1 .707.708L12.708 12l2.646 2.646a.5.5 0 0 1 0 .708" />
		<path fill-rule="evenodd" d="M.5 12C.5 5.649 5.649.5 12 .5S23.5 5.649 23.5 12 18.351 23.5 12 23.5.5 18.351.5 12M12 1.5C6.201 1.5 1.5 6.201 1.5 12S6.201 22.5 12 22.5 22.5 17.799 22.5 12 17.799 1.5 12 1.5" clip-rule="evenodd" />
	{:else if variant === 'filled'}
		<path fill-rule="evenodd" d="M.25 12C.25 5.51 5.51.25 12 .25S23.75 5.51 23.75 12 18.49 23.75 12 23.75.25 18.49.25 12m8.22 3.53a.75.75 0 0 1 0-1.06L10.94 12 8.47 9.53a.75.75 0 0 1 1.06-1.06L12 10.94l2.47-2.47a.75.75 0 1 1 1.06 1.06L13.06 12l2.47 2.47a.75.75 0 1 1-1.06 1.06L12 13.06l-2.47 2.47a.75.75 0 0 1-1.06 0" clip-rule="evenodd" />
	{:else if variant === 'duotone'}
		<path d="M12 .25C5.51.25.25 5.51.25 12S5.51 23.75 12 23.75 23.75 18.49 23.75 12 18.49.25 12 .25" opacity=".4" />
		<path d="M8.47 14.47a.75.75 0 1 0 1.06 1.06L12 13.06l2.47 2.47a.75.75 0 1 0 1.06-1.06L13.06 12l2.47-2.47a.75.75 0 0 0-1.06-1.06L12 10.94 9.53 8.47a.75.75 0 0 0-1.06 1.06L10.94 12z" />
	{:else if variant === 'duotone-line'}
		<path d="M23 12c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11" opacity=".4" />
		<path d="M15.354 15.354a.5.5 0 0 1-.708 0L12 12.707l-2.646 2.647a.5.5 0 0 1-.708-.708L11.293 12 8.646 9.354a.5.5 0 1 1 .708-.708L12 11.293l2.646-2.647a.5.5 0 1 1 .708.708L12.707 12l2.647 2.646a.5.5 0 0 1 0 .708" />
		<path fill-rule="evenodd" d="M.5 12C.5 5.649 5.649.5 12 .5S23.5 5.649 23.5 12 18.351 23.5 12 23.5.5 18.351.5 12M12 1.5C6.201 1.5 1.5 6.201 1.5 12S6.201 22.5 12 22.5 22.5 17.799 22.5 12 17.799 1.5 12 1.5" clip-rule="evenodd" />
	{/if}
</svg>
