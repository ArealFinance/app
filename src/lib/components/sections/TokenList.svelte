<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Card, EmptyState } from '$lib/components/ui';
	import type { CardVariant, CardPadding } from '$lib/components/ui';

	type Props = {
		variant?: CardVariant;
		padding?: CardPadding;
		dividers?: boolean;
		empty?: Snippet;
		header?: Snippet;
		children?: Snippet;
		emptyTitle?: string;
		emptyDescription?: string;
		isEmpty?: boolean;
	};

	let {
		variant = 'surface',
		padding = 'none',
		dividers = true,
		empty,
		header,
		children,
		emptyTitle = 'No tokens',
		emptyDescription,
		isEmpty = false
	}: Props = $props();
</script>

<Card {variant} {padding}>
	{#if header}
		<div class="token-list-head">{@render header()}</div>
	{/if}

	{#if isEmpty}
		{#if empty}
			{@render empty()}
		{:else}
			<EmptyState title={emptyTitle} description={emptyDescription} />
		{/if}
	{:else}
		<div class="token-list" class:dividers>
			{@render children?.()}
		</div>
	{/if}
</Card>

<style>
	.token-list {
		display: flex;
		flex-direction: column;
	}

	.token-list.dividers > :global(* + *) {
		border-top: 1px solid var(--color-border);
	}

	.token-list-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-4) var(--space-3);
		border-bottom: 1px solid var(--color-border);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}
</style>
