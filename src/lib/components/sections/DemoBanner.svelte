<script lang="ts" module>
	export type DemoBannerTone = 'warning' | 'info' | 'success' | 'danger' | 'neutral';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { IconButton } from '$lib/components/ui';
	import { Xmark } from '$lib/icons';

	type Props = {
		text?: string;
		dismissible?: boolean;
		storageKey?: string;
		tone?: DemoBannerTone;
	};

	let {
		text = 'Demo mode product is under active development',
		dismissible = false,
		storageKey = 'areal-demo-banner-dismissed',
		tone = 'warning'
	}: Props = $props();

	let dismissed = $state(false);

	onMount(() => {
		if (dismissible && typeof localStorage !== 'undefined') {
			try {
				dismissed = localStorage.getItem(storageKey) === '1';
			} catch {
				/* localStorage may throw in private mode — fall through */
			}
		}
	});

	function dismiss() {
		dismissed = true;
		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem(storageKey, '1');
			} catch {
				/* private mode */
			}
		}
	}
</script>

{#if !dismissed}
	<div class="demo-banner tone-{tone}">
		<span class="demo-dot-wrap" aria-hidden="true">
			<span class="demo-dot"></span>
		</span>
		<span class="demo-text">{text}</span>
		{#if dismissible}
			<IconButton variant="ghost" size="sm" aria-label="Dismiss banner" onclick={dismiss}>
				<Xmark size={12} />
			</IconButton>
		{/if}
	</div>
{/if}

<style>
	.demo-banner {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.demo-dot-wrap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: var(--radius-full);
		background-color: var(--demo-tint);
		flex-shrink: 0;
	}

	.demo-dot {
		display: block;
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background-color: var(--demo-color);
		box-shadow: 0 0 8px 4px var(--demo-glow);
	}

	.demo-text {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		letter-spacing: -0.2px;
		line-height: 1.4;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	/* tones */
	.tone-warning {
		--demo-color: var(--color-warning, #ff8c00);
		--demo-tint: rgba(255, 140, 0, 0.07);
		--demo-glow: rgba(255, 140, 0, 0.5);
	}
	.tone-info {
		--demo-color: var(--color-primary);
		--demo-tint: var(--color-info-tint);
		--demo-glow: rgba(168, 132, 255, 0.5);
	}
	.tone-success {
		--demo-color: var(--color-success);
		--demo-tint: var(--color-success-tint);
		--demo-glow: rgba(16, 185, 129, 0.5);
	}
	.tone-danger {
		--demo-color: var(--color-danger);
		--demo-tint: var(--color-danger-tint);
		--demo-glow: rgba(239, 68, 68, 0.5);
	}
	.tone-neutral {
		--demo-color: var(--color-text-muted);
		--demo-tint: var(--color-gray-900-20);
		--demo-glow: rgba(107, 114, 128, 0.4);
	}
</style>
