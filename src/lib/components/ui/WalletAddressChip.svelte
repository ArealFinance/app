<script lang="ts" module>
	export type WalletChipSize = 'sm' | 'md';
	export type WalletChipStatus = 'connected' | 'disconnected';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { ArrowUpRightSmall } from '$lib/icons';
	import { truncateAddress } from '$lib/utils/address';
	import type { PolymorphicProps } from './_polymorphic';

	type Props = {
		address: string;
		truncate?: number;
		size?: WalletChipSize;
		status?: WalletChipStatus;
		dotColor?: string;
		iconLeft?: Snippet;
		iconRight?: Snippet;
		hideIcon?: boolean;
	} & PolymorphicProps;

	let {
		address,
		truncate = 4,
		size = 'md',
		status = 'connected',
		dotColor,
		hideIcon = false,
		iconLeft,
		iconRight,
		href = undefined,
		type = 'button',
		class: className = '',
		'aria-label': ariaLabel,
		...rest
	}: Props = $props();

	const display = $derived(truncateAddress(address, truncate));
	const fullLabel = $derived(ariaLabel ?? `Wallet ${address}`);
</script>

{#snippet content()}
	{#if iconLeft}
		<span class="chip-slot">{@render iconLeft()}</span>
	{:else}
		<span
			class="chip-dot status-{status}"
			style:background-color={dotColor}
			aria-hidden="true"
		></span>
	{/if}
	<span class="chip-address">{display}</span>
	{#if iconRight}
		<span class="chip-slot">{@render iconRight()}</span>
	{:else if !hideIcon}
		<span class="chip-slot chip-icon">
			<ArrowUpRightSmall size={size === 'sm' ? 16 : 18} />
		</span>
	{/if}
{/snippet}

{#if href}
	<a
		{href}
		class="chip chip-size-{size} {className}"
		aria-label={fullLabel}
		{...rest as HTMLAnchorAttributes}
	>
		{@render content()}
	</a>
{:else}
	<button
		{type}
		class="chip chip-size-{size} {className}"
		aria-label={fullLabel}
		{...rest as HTMLButtonAttributes}
	>
		{@render content()}
	</button>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-body);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 1px;
		color: var(--color-purple-200);
		background-color: var(--color-surface-glass);
		border: 1px solid var(--color-border-strong);
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out);
	}

	.chip:hover {
		background-color: var(--color-surface-inset);
	}
	.chip:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
	.chip:disabled,
	.chip[aria-disabled='true'] {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}

	.chip-size-sm {
		height: 32px;
		padding: 0 var(--space-2);
		font-size: 11px;
		border-radius: var(--radius-md);
		gap: 6px;
	}

	/* size="md" = hero CTA variant: Halvar Bold 14, white text centred, transparent bg
	 * with a 1px dark border (#181A29). Different typography than header chip (sm). */
	.chip-size-md {
		height: 48px;
		padding: 0 var(--space-4);
		font-family: var(--font-sans); /* Halvar Breitschrift */
		font-weight: var(--font-weight-bold);
		font-size: var(--text-base); /* 14 */
		letter-spacing: var(--tracking-tight); /* -0.6 */
		color: var(--color-text); /* #FBF2FF */
		background-color: transparent;
		border-color: var(--color-border-strong); /* #181A29 = --color-dark-700 */
		border-radius: var(--radius-lg); /* 20 — matches Figma rounded-20 */
		justify-content: center;
		text-align: center;
	}
	.chip-size-md:hover {
		background-color: rgba(255, 255, 255, 0.05);
	}

	.chip-dot {
		display: inline-block;
		flex-shrink: 0;
		width: 16px;
		height: 16px;
		border-radius: var(--radius-full);
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.chip-size-sm .chip-dot {
		width: 16px;
		height: 16px;
	}

	.chip-dot.status-connected {
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.chip-dot.status-disconnected {
		background: var(--color-text-muted);
	}

	.chip-address {
		font-feature-settings: 'tnum' 1;
		font-variant-numeric: tabular-nums;
		text-transform: uppercase;
	}

	.chip-slot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.chip-icon {
		color: var(--color-purple-200); /* #EADAFF — same tint as address text */
	}
</style>
