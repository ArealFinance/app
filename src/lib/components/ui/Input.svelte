<script lang="ts" module>
	export type InputVariant = 'default' | 'ghost';
	export type InputSize = 'md' | 'lg';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = {
		value?: string;
		variant?: InputVariant;
		size?: InputSize;
		error?: boolean;
		iconLeft?: Snippet;
		suffix?: Snippet;
	} & Omit<HTMLInputAttributes, 'value' | 'size'>;

	let {
		value = $bindable(''),
		variant = 'default',
		size = 'md',
		error = false,
		disabled = false,
		class: className = '',
		iconLeft,
		suffix,
		...rest
	}: Props = $props();
</script>

<div
	class="input-wrap input-{variant} size-{size} {className}"
	class:error
	class:disabled
>
	{#if iconLeft}<span class="input-slot input-slot-left">{@render iconLeft()}</span>{/if}
	<input class="input-control" bind:value {disabled} {...rest} />
	{#if suffix}<span class="input-slot input-slot-suffix">{@render suffix()}</span>{/if}
</div>

<style>
	.input-wrap {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		font-family: var(--font-sans);
		color: var(--color-text);
		transition:
			border-color var(--motion-base) var(--ease-out),
			background-color var(--motion-base) var(--ease-out),
			opacity var(--motion-base) var(--ease-out);
	}

	.input-control {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: none;
		color: inherit;
		font: inherit;
		letter-spacing: var(--tracking-tight);
		padding: 0;
	}

	.input-control::placeholder {
		color: var(--color-text-muted);
	}

	.input-control:disabled {
		cursor: not-allowed;
	}

	/* ---------- sizes ---------- */
	.size-md {
		height: 48px;
		padding: 0 var(--space-4);
		font-size: var(--text-base);
		border-radius: var(--radius-md);
	}

	.size-lg {
		height: 56px;
		padding: 0 var(--space-5);
		font-size: var(--text-md);
		border-radius: var(--radius-lg);
	}

	/* ---------- variants ---------- */
	.input-default {
		background-color: var(--color-surface-inset);
		border: 1px solid var(--color-border-strong);
	}
	.input-default:hover:not(.disabled) {
		border-color: var(--color-text-muted);
	}
	.input-default:focus-within {
		border-color: var(--color-primary);
	}

	.input-ghost {
		background-color: transparent;
		border: 1px solid transparent;
	}
	.input-ghost:focus-within {
		border-color: var(--color-border-strong);
	}

	/* ---------- error ---------- */
	.error.input-default,
	.error.input-default:focus-within,
	.error.input-default:hover {
		border-color: var(--color-danger);
	}
	.error.input-ghost:focus-within {
		border-color: var(--color-danger);
	}

	/* ---------- disabled ---------- */
	.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ---------- slots ---------- */
	.input-slot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--color-text-muted);
	}

	.input-slot-suffix {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
	}
</style>
