<script lang="ts" module>
	export type EmptyStateSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		title?: string;
		description?: string;
		size?: EmptyStateSize;
		icon?: Snippet;
		action?: Snippet;
	} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

	let {
		title,
		description,
		size = 'md',
		class: className = '',
		icon,
		action,
		...rest
	}: Props = $props();
</script>

<div class="empty-state empty-size-{size} {className}" {...rest}>
	{#if icon}
		<div class="empty-icon">{@render icon()}</div>
	{/if}
	{#if title}<div class="empty-title">{title}</div>{/if}
	{#if description}<div class="empty-description">{description}</div>{/if}
	{#if action}<div class="empty-action">{@render action()}</div>{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: var(--space-3);
		color: var(--color-text);
	}

	.empty-size-sm {
		padding: var(--space-6) var(--space-4);
	}
	.empty-size-md {
		padding: var(--space-10) var(--space-6);
	}
	.empty-size-lg {
		padding: var(--space-16) var(--space-8);
	}

	.empty-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		margin-bottom: var(--space-1);
	}

	.empty-title {
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.empty-size-sm .empty-title {
		font-size: var(--text-base);
	}
	.empty-size-lg .empty-title {
		font-size: var(--text-2xl);
	}

	.empty-description {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		max-width: 360px;
		line-height: var(--leading-relaxed);
	}
	.empty-size-lg .empty-description {
		font-size: var(--text-base);
		max-width: 460px;
	}

	.empty-action {
		margin-top: var(--space-3);
	}
</style>
