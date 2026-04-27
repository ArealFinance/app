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
		<path fill-rule="evenodd" d="M6.878 13.56a2.25 2.25 0 0 1 0-3.119l5.343-5.558c1.28-1.33 3.528-.425 3.528 1.42v11.395c0 1.845-2.248 2.75-3.528 1.42zm1.081-2.08a.75.75 0 0 0 0 1.04l5.344 5.559a.55.55 0 0 0 .946-.381V6.304a.55.55 0 0 0-.946-.382z" clip-rule="evenodd" />
	{:else if variant === 'light'}
		<path fill-rule="evenodd" d="M7.058 13.386a2 2 0 0 1 0-2.772l5.344-5.558c1.123-1.169 3.097-.373 3.097 1.247v11.394c0 1.621-1.974 2.416-3.097 1.248zm.721-2.079a1 1 0 0 0 0 1.386l5.344 5.559c.499.519 1.376.166 1.376-.555V6.303c0-.72-.877-1.073-1.376-.554z" clip-rule="evenodd" />
	{:else if variant === 'filled'}
		<path d="M7.058 10.615a2 2 0 0 0 0 2.772l5.344 5.558c1.123 1.168 3.097.373 3.097-1.247V6.304c0-1.621-1.974-2.416-3.097-1.248z" />
	{:else if variant === 'duotone'}
		<path d="M7.058 10.615a2 2 0 0 0 0 2.772l5.344 5.558c1.123 1.168 3.097.373 3.097-1.247V6.304c0-1.621-1.974-2.416-3.097-1.248z" opacity=".4" />
	{:else if variant === 'duotone-line'}
		<path d="m7.419 10.961 5.343-5.558c.811-.844 2.237-.27 2.237.9v11.394c0 1.171-1.426 1.745-2.237.901L7.42 13.04a1.5 1.5 0 0 1 0-2.079" opacity=".4" />
		<path fill-rule="evenodd" d="M7.058 13.387a2 2 0 0 1 0-2.773l5.344-5.558c1.123-1.168 3.097-.373 3.097 1.248v11.394c0 1.62-1.974 2.415-3.097 1.247zm.721-2.08a1 1 0 0 0 0 1.387l5.344 5.558c.499.52 1.376.166 1.376-.554V6.304c0-.72-.877-1.074-1.376-.555z" clip-rule="evenodd" />
	{/if}
</svg>
