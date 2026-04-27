<script lang="ts" module>
	export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
	export type StatusVariant = 'neutral' | 'tonal' | 'dot';
	export type StatusSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		tone?: StatusTone;
		variant?: StatusVariant;
		size?: StatusSize;
		iconLeft?: Snippet;
		iconRight?: Snippet;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

	let {
		tone = 'neutral',
		variant = 'neutral',
		size = 'sm',
		class: className = '',
		iconLeft,
		iconRight,
		children,
		...rest
	}: Props = $props();
</script>

<span
	class="pill pill-{variant} tone-{tone} size-{size} {className}"
	{...rest}
>
	{#if variant === 'dot'}
		<span class="pill-dot-marker" aria-hidden="true"></span>
	{/if}
	{#if iconLeft}<span class="pill-slot">{@render iconLeft()}</span>{/if}
	{#if children}<span class="pill-label">{@render children()}</span>{/if}
	{#if iconRight}<span class="pill-slot">{@render iconRight()}</span>{/if}
</span>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-sans);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		line-height: 1;
		border-radius: var(--radius-full);
		white-space: nowrap;
		user-select: none;
	}

	/* ---------- sizes ---------- */
	.size-sm {
		height: 18px;
		padding: 0 var(--space-2);
		font-size: 10px;
		gap: var(--space-1);
	}
	.size-md {
		height: 24px;
		padding: 0 var(--space-3);
		font-size: var(--text-xs);
	}
	.size-lg {
		height: 32px;
		padding: 0 var(--space-4);
		font-size: var(--text-sm);
	}

	/* dot marker scales with size */
	.pill-dot-marker {
		display: inline-block;
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
	}
	.size-md .pill-dot-marker {
		width: 8px;
		height: 8px;
	}
	.size-lg .pill-dot-marker {
		width: 10px;
		height: 10px;
	}

	.pill-slot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	/* ---------- variant: neutral (gray bg + white text — "24H") ---------- */
	.pill-neutral {
		background-color: var(--color-gray-900-20);
		color: var(--color-text);
	}

	/* ---------- variant: tonal (tone-tinted bg + tone text — "+0.57%") ---------- */
	.pill-tonal.tone-success {
		background-color: var(--color-success-tint);
		color: var(--color-green-500);
	}
	.pill-tonal.tone-warning {
		background-color: var(--color-warning-tint);
		color: var(--color-orange-900);
	}
	.pill-tonal.tone-danger {
		background-color: var(--color-danger-tint);
		color: var(--color-red-900);
	}
	.pill-tonal.tone-info {
		background-color: var(--color-info-tint);
		color: var(--color-purple-300);
	}
	.pill-tonal.tone-neutral {
		background-color: var(--color-gray-900-20);
		color: var(--color-text);
	}

	/* ---------- variant: dot (transparent + colored dot — "STABLE", "PROTOCOL") ---------- */
	.pill-dot {
		background-color: transparent;
		color: var(--color-text);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
	}
	.pill-dot.tone-success .pill-dot-marker {
		background-color: var(--color-success);
	}
	.pill-dot.tone-warning .pill-dot-marker {
		background-color: var(--color-warning);
	}
	.pill-dot.tone-danger .pill-dot-marker {
		background-color: var(--color-danger);
	}
	.pill-dot.tone-info .pill-dot-marker {
		background-color: var(--color-primary);
	}
	.pill-dot.tone-neutral .pill-dot-marker {
		background-color: var(--color-text-muted);
	}
</style>
