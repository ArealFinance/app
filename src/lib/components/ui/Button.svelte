<script lang="ts" module>
	export type ButtonVariant = 'primary' | 'outline' | 'inverse' | 'accent';
	export type ButtonSize = 'md' | 'lg' | 'icon';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import type { PolymorphicProps } from './_polymorphic';

	type Props = {
		variant?: ButtonVariant;
		size?: ButtonSize;
		full?: boolean;
		children?: Snippet;
		iconLeft?: Snippet;
		iconRight?: Snippet;
	} & PolymorphicProps;

	let {
		variant = 'outline',
		size = 'md',
		full = false,
		href = undefined,
		type = 'button',
		class: className = '',
		children,
		iconLeft,
		iconRight,
		...rest
	}: Props = $props();
</script>

{#snippet content()}
	{#if iconLeft}
		<span class="btn-icon-slot"><svelte:boundary>{@render iconLeft()}</svelte:boundary></span>
	{/if}
	{#if children && size !== 'icon'}
		<span class="btn-label">{@render children()}</span>
	{:else if children && size === 'icon'}
		{@render children()}
	{/if}
	{#if iconRight}
		<span class="btn-icon-slot"><svelte:boundary>{@render iconRight()}</svelte:boundary></span>
	{/if}
{/snippet}

{#if href}
	<a
		{href}
		class="btn btn-{variant} btn-size-{size} {full ? 'btn-full' : ''} {className}"
		{...rest as HTMLAnchorAttributes}
	>
		{@render content()}
	</a>
{:else}
	<button
		{type}
		class="btn btn-{variant} btn-size-{size} {full ? 'btn-full' : ''} {className}"
		{...rest as HTMLButtonAttributes}
	>
		{@render content()}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		height: var(--btn-height);
		padding: 0 var(--space-5);
		border: 1px solid transparent;
		border-radius: var(--radius-button);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out),
			color var(--motion-base) var(--ease-out),
			opacity var(--motion-base) var(--ease-out);
	}

	.btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.btn:disabled,
	.btn[aria-disabled='true'] {
		opacity: 0.4;
		cursor: not-allowed;
		pointer-events: none;
	}

	.btn-full {
		width: 100%;
	}

	/* Primary — solid purple (footer send, primary CTAs) */
	.btn-primary {
		background-color: var(--color-purple-400);
		color: var(--color-white-900);
	}
	.btn-primary:hover {
		background-color: var(--color-purple-500);
	}
	.btn-primary:active {
		background-color: var(--color-purple-700);
	}

	/* Outline — transparent + dark border (homepage default, wallet chip) */
	.btn-outline {
		background-color: transparent;
		color: var(--color-text);
		border-color: var(--color-border-strong);
	}
	.btn-outline:hover {
		background-color: var(--color-surface-inset);
	}
	.btn-outline:active {
		background-color: var(--color-surface);
	}

	/* Inverse — white bg, dark text (404, alt CTAs on solid dark) */
	.btn-inverse {
		background-color: var(--color-white-900);
		color: var(--color-text-inverse);
	}
	.btn-inverse:hover {
		background-color: var(--color-white-800);
	}
	.btn-inverse:active {
		background-color: var(--color-white-700);
	}

	/* Accent — lavender bg (#a984f3) + dark text. Per Figma `connect wallet`
	 * Default (9:719). Used for header CTA on dark surface; `:hover` flips
	 * to white per Figma Variant2 (9:721). */
	.btn-accent {
		background-color: var(--color-purple-400);
		color: var(--color-text-inverse);
	}
	.btn-accent:hover {
		background-color: var(--color-white-900);
	}
	.btn-accent:active {
		background-color: var(--color-white-700);
	}

	/* Sizes */
	.btn-size-icon {
		width: var(--btn-height);
		padding: 0;
	}

	/* Large — 56px tall, no uppercase. Matches Figma CTAs that aren't
	 * legacy "shouted" buttons (header `connect wallet`, future macets). */
	.btn-size-lg {
		height: 56px;
		padding: 0 16px;
		text-transform: none;
		font-size: 14px;
	}

	.btn-icon-slot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.btn-label {
		display: inline-block;
	}
</style>
