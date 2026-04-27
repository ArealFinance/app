<script lang="ts" module>
	export type StatCardSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import Card from './Card.svelte';
	import type { CardVariant } from './Card.svelte';

	type Props = {
		label?: string;
		value?: string | number;
		unit?: string;
		size?: StatCardSize;
		variant?: CardVariant;
		header?: Snippet;
		footer?: Snippet;
		chart?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

	let {
		label,
		value,
		unit,
		size = 'md',
		variant = 'surface',
		class: className = '',
		header,
		footer,
		chart,
		...rest
	}: Props = $props();

	const cardPadding = $derived(size === 'sm' ? 'sm' : 'md');
	const cardRadius = $derived(size === 'sm' ? 'lg' : 'xl');
</script>

<Card
	{variant}
	padding={cardPadding}
	radius={cardRadius}
	class={className}
	{...rest}
>
	<div class="stat stat-size-{size}">
		<div class="stat-head">
			{#if header}
				{@render header()}
			{:else if label}
				<div class="stat-label">{label}</div>
			{/if}
		</div>

		<div class="stat-value">
			{value ?? ''}{#if unit}<span class="stat-unit">{unit}</span>{/if}
		</div>

		{#if footer}
			<div class="stat-footer">{@render footer()}</div>
		{/if}

		{#if chart}
			<div class="stat-chart">{@render chart()}</div>
		{/if}
	</div>
</Card>

<style>
	.stat-head {
		min-height: 14px;
	}

	.stat-label {
		font-size: 10px;
		font-weight: var(--font-weight-medium);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-muted);
		margin-bottom: var(--space-2);
	}

	.stat-value {
		font-family: var(--font-sans);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
		line-height: 1.1;
	}

	.stat-size-sm .stat-value {
		font-size: var(--text-md);
	}
	.stat-size-md .stat-value {
		font-size: var(--text-xl);
	}
	.stat-size-lg .stat-value {
		font-size: var(--text-3xl);
	}

	.stat-unit {
		font-size: 0.6em;
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
		margin-left: var(--space-1);
		letter-spacing: 0;
	}

	.stat-footer {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		flex-wrap: wrap;
		margin-top: var(--space-3);
	}

	.stat-chart {
		margin-top: var(--space-3);
		min-height: 60px;
	}
</style>
