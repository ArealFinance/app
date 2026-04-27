<script lang="ts" module>
	export type TokenRowSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type {
		HTMLAttributes,
		HTMLAnchorAttributes,
		HTMLButtonAttributes
	} from 'svelte/elements';
	import type { PolymorphicElementProps } from './_polymorphic';

	type Props = {
		symbol?: string;
		name?: string;
		amount?: string | number;
		value?: string | number;
		size?: TokenRowSize;
		icon?: Snippet;
		trailing?: Snippet;
		chart?: Snippet;
	} & PolymorphicElementProps;

	let {
		symbol,
		name,
		amount,
		value,
		size = 'md',
		href = undefined,
		type = undefined,
		class: className = '',
		icon,
		trailing,
		chart,
		...rest
	}: Props = $props();

</script>

{#snippet body()}
	{#if icon}
		<span class="row-icon">{@render icon()}</span>
	{/if}

	<span class="row-text">
		{#if name}<span class="row-name">{name}</span>{/if}
		{#if symbol}<span class="row-symbol">{symbol}</span>{/if}
	</span>

	{#if chart}
		<span class="row-chart">{@render chart()}</span>
	{/if}

	{#if trailing}
		<span class="row-trailing">{@render trailing()}</span>
	{:else if amount !== undefined || value !== undefined}
		<span class="row-meta">
			{#if amount !== undefined}<span class="row-amount">{amount}</span>{/if}
			{#if value !== undefined}<span class="row-value">{value}</span>{/if}
		</span>
	{/if}
{/snippet}

{#if href}
	<a
		{href}
		class="row row-size-{size} interactive {className}"
		{...rest as HTMLAnchorAttributes}
	>
		{@render body()}
	</a>
{:else if type}
	<button
		{type}
		class="row row-size-{size} interactive {className}"
		{...rest as HTMLButtonAttributes}
	>
		{@render body()}
	</button>
{:else}
	<div class="row row-size-{size} {className}" {...rest as HTMLAttributes<HTMLDivElement>}>
		{@render body()}
	</div>
{/if}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: 0 var(--space-4);
		border: 0;
		background: transparent;
		font-family: var(--font-sans);
		color: var(--color-text);
		text-align: left;
		text-decoration: none;
	}

	.row-size-sm {
		min-height: 56px;
	}
	.row-size-md {
		min-height: 78px;
	}
	.row-size-lg {
		min-height: 80px;
	}

	.row.interactive {
		cursor: pointer;
		border-radius: var(--radius-md);
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.row.interactive:hover {
		background-color: var(--color-surface-inset);
	}
	.row.interactive:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.row-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		background-color: var(--color-surface-inset);
		overflow: hidden;
	}
	.row-size-sm .row-icon {
		width: 28px;
		height: 28px;
	}
	.row-size-lg .row-icon {
		width: 44px;
		height: 44px;
	}

	.row-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.row-name {
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-symbol {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}

	.row-chart {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		width: 80px;
		height: 32px;
	}

	.row-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		flex-shrink: 0;
	}

	.row-amount {
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		font-variant-numeric: tabular-nums;
	}

	.row-value {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.row-trailing {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}
</style>
