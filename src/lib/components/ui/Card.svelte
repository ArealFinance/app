<script lang="ts" module>
	export type CardVariant = 'surface' | 'muted' | 'outline' | 'inset';
	export type CardPadding = 'none' | 'sm' | 'md' | 'lg';
	export type CardRadius = 'md' | 'lg' | 'xl';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		variant?: CardVariant;
		padding?: CardPadding;
		radius?: CardRadius;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

	let {
		variant = 'surface',
		padding = 'md',
		radius = 'xl',
		class: className = '',
		children,
		...rest
	}: Props = $props();
</script>

<div
	class="card card-{variant} card-pad-{padding} card-radius-{radius} {className}"
	{...rest}
>
	{@render children?.()}
</div>

<style>
	.card {
		display: block;
		border: 1px solid transparent;
		min-width: 0; /* allow inner shrink */
	}

	/* Variants — backgrounds + borders sourced from tokens */
	.card-surface {
		background-color: var(--color-surface); /* #080a0f */
	}

	.card-muted {
		background-color: var(--color-surface-muted); /* rgba(7,12,28,0.4) */
		border-color: var(--color-border);
	}

	.card-outline {
		background-color: transparent;
		border-color: var(--color-border);
	}

	.card-inset {
		background-color: var(--color-surface-inset); /* #181a29 */
	}

	/* Padding scale */
	.card-pad-none {
		padding: 0;
	}
	.card-pad-sm {
		padding: var(--space-4); /* 16px */
	}
	.card-pad-md {
		padding: var(--space-6); /* 24px */
	}
	.card-pad-lg {
		padding: var(--space-8); /* 32px */
	}

	/* Radius — mapped to visible Figma scale */
	.card-radius-md {
		border-radius: var(--radius-md); /* 12px — chips / inset */
	}
	.card-radius-lg {
		border-radius: var(--radius-lg); /* 20px — token cards */
	}
	.card-radius-xl {
		border-radius: var(--radius-xl); /* 24px — large cards (default) */
	}
</style>
