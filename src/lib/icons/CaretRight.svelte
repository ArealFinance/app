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
		<path fill-rule="evenodd" d="M17.12 13.56a2.25 2.25 0 0 0 0-3.119l-5.343-5.558c-1.279-1.331-3.527-.426-3.527 1.42v11.394c0 1.846 2.248 2.752 3.528 1.421zm-1.08-2.08c.279.29.279.75 0 1.04l-5.344 5.558a.55.55 0 0 1-.946-.38V6.302a.55.55 0 0 1 .946-.38z" clip-rule="evenodd" />
	{:else if variant === 'light'}
		<path fill-rule="evenodd" d="M16.94 13.386a2 2 0 0 0 0-2.772l-5.343-5.558C10.474 3.887 8.5 4.683 8.5 6.303v11.394c0 1.621 1.974 2.416 3.097 1.248zm-.72-2.079a1 1 0 0 1 0 1.386l-5.344 5.559c-.499.519-1.376.166-1.376-.555V6.303c0-.72.877-1.073 1.376-.554z" clip-rule="evenodd" />
	{:else if variant === 'filled'}
		<path d="M16.94 10.614a2 2 0 0 1 0 2.772l-5.343 5.559c-1.123 1.168-3.097.373-3.097-1.248V6.303c0-1.62 1.974-2.416 3.097-1.247z" />
	{:else if variant === 'duotone'}
		<path d="M16.94 10.614a2 2 0 0 1 0 2.772l-5.343 5.559c-1.123 1.168-3.097.373-3.097-1.248V6.303c0-1.62 1.974-2.416 3.097-1.247z" opacity=".4" />
	{:else if variant === 'duotone-line'}
		<path d="m16.58 10.961-5.343-5.558c-.812-.844-2.237-.27-2.237.9v11.394c0 1.171 1.425 1.745 2.237.901l5.343-5.558a1.5 1.5 0 0 0 0-2.079" opacity=".4" />
		<path fill-rule="evenodd" d="M16.94 13.386a2 2 0 0 0 0-2.772l-5.343-5.558C10.474 3.887 8.5 4.683 8.5 6.303v11.394c0 1.621 1.974 2.416 3.097 1.248zm-.72-2.079a1 1 0 0 1 0 1.386l-5.344 5.559c-.499.519-1.376.166-1.376-.555V6.303c0-.72.877-1.073 1.376-.554z" clip-rule="evenodd" />
	{/if}
</svg>
