<script lang="ts" module>
	export interface TabItem {
		label: string;
		value: string;
		href?: string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	type Props = {
		items: TabItem[];
		value?: string;
		onChange?: (value: string) => void;
	};

	let { items, value, onChange }: Props = $props();
</script>

<div class="tab-bar" role="tablist">
	{#each items as item}
		{@const isActive = item.value === value}
		{#if item.href}
			<a
				href={item.href}
				class="tab"
				class:active={isActive}
				class:disabled={item.disabled}
				aria-selected={isActive}
				aria-disabled={item.disabled || undefined}
				role="tab"
				tabindex={isActive ? 0 : -1}
			>
				{item.label}
			</a>
		{:else}
			<button
				type="button"
				class="tab"
				class:active={isActive}
				disabled={item.disabled}
				aria-selected={isActive}
				role="tab"
				tabindex={isActive ? 0 : -1}
				onclick={() => onChange?.(item.value)}
			>
				{item.label}
			</button>
		{/if}
	{/each}
</div>

<style>
	.tab-bar {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1);
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-lg);
	}

	.tab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: var(--control-height-sm);
		padding: 0 var(--space-4);
		border: 0;
		background: transparent;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
		border-radius: var(--radius-md);
		cursor: pointer;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background-color var(--motion-base) var(--ease-out),
			color var(--motion-base) var(--ease-out);
	}

	.tab:hover:not(.disabled):not(.active) {
		color: var(--color-text);
	}

	.tab.active {
		background-color: var(--color-white-900);
		color: var(--color-text-inverse);
	}

	.tab.disabled,
	.tab:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		pointer-events: none;
	}

	.tab:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
</style>
