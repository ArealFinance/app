<script lang="ts" module>
	export type IconButtonVariant = 'ghost' | 'subtle' | 'solid' | 'inset';
	export type IconButtonSize = 'sm' | 'md' | 'lg' | 'xl';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import type { PolymorphicProps } from './_polymorphic';

	type Props = {
		variant?: IconButtonVariant;
		size?: IconButtonSize;
		children?: Snippet;
	} & PolymorphicProps;

	let {
		variant = 'ghost',
		size = 'md',
		href = undefined,
		type = 'button',
		class: className = '',
		children,
		...rest
	}: Props = $props();
</script>

{#if href}
	<a
		{href}
		class="icon-btn icon-btn-{variant} icon-btn-size-{size} {className}"
		{...rest as HTMLAnchorAttributes}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		class="icon-btn icon-btn-{variant} icon-btn-size-{size} {className}"
		{...rest as HTMLButtonAttributes}
	>
		{@render children?.()}
	</button>
{/if}

<style>
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		color: var(--color-text);
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out),
			color var(--motion-base) var(--ease-out),
			opacity var(--motion-base) var(--ease-out);
	}

	.icon-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.icon-btn:disabled,
	.icon-btn[aria-disabled='true'] {
		opacity: 0.4;
		cursor: not-allowed;
		pointer-events: none;
	}

	/* ---------- sizes ---------- */
	.icon-btn-size-sm {
		width: 24px;
		height: 24px;
		font-size: 12px;
		border-radius: var(--radius-sm);
	}
	.icon-btn-size-md {
		width: 32px;
		height: 32px;
		font-size: 14px;
		border-radius: var(--radius-md);
	}
	.icon-btn-size-lg {
		width: 44px;
		height: 44px;
		font-size: 16px;
		border-radius: var(--radius-md);
	}
	/* xl — footer send square (Figma: 80×80, 16-radius, 2px border) */
	.icon-btn-size-xl {
		width: 80px;
		height: 80px;
		font-size: 20px;
		border-radius: 16px;
		border-width: 2px;
	}

	/* ---------- variants ---------- */

	/* ghost — transparent default; hover surfaces a tint (inline list-row actions) */
	.icon-btn-ghost {
		background-color: transparent;
		color: var(--color-text-muted);
	}
	.icon-btn-ghost:hover {
		background-color: var(--color-surface-inset);
		color: var(--color-text);
	}
	.icon-btn-ghost:active {
		background-color: var(--color-dark-600);
	}

	/* subtle — faint surface bg; for light affordances inside cards */
	.icon-btn-subtle {
		background-color: var(--color-surface);
		color: var(--color-text);
		border-color: var(--color-border);
	}
	.icon-btn-subtle:hover {
		background-color: var(--color-surface-inset);
	}

	/* solid — purple primary (footer send square) */
	.icon-btn-solid {
		background-color: var(--color-purple-400);
		color: var(--color-white-900);
	}
	.icon-btn-solid:hover {
		background-color: var(--color-purple-500);
	}
	.icon-btn-solid:active {
		background-color: var(--color-purple-700);
	}

	/* inset — deeper dark surface (scroll-to-top footer button) */
	.icon-btn-inset {
		background-color: var(--color-surface-inset);
		color: var(--color-text);
	}
	.icon-btn-inset:hover {
		background-color: var(--color-dark-600);
	}
</style>
