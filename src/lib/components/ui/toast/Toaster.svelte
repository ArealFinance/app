<script lang="ts">
	import { fly } from 'svelte/transition';
	import { toast } from './toast-store';
	import Toast from './Toast.svelte';

	type Position = 'top-right' | 'bottom-right' | 'top-center' | 'bottom-center';

	let { position = 'bottom-right' }: { position?: Position } = $props();
</script>

<div class="toaster pos-{position}" aria-live="polite" aria-relevant="additions">
	{#each $toast as entry (entry.id)}
		<div
			class="toaster-item"
			in:fly={{ y: 10, duration: 200 }}
			out:fly={{ y: 10, duration: 150 }}
		>
			<Toast {entry} />
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		z-index: var(--z-toast);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		pointer-events: none;
	}

	.toaster :global(.toast) {
		pointer-events: auto;
	}

	.pos-bottom-right {
		bottom: var(--space-6);
		right: var(--space-6);
		align-items: flex-end;
	}
	.pos-top-right {
		top: var(--space-6);
		right: var(--space-6);
		align-items: flex-end;
	}
	.pos-top-center {
		top: var(--space-6);
		left: 50%;
		transform: translateX(-50%);
		align-items: center;
	}
	.pos-bottom-center {
		bottom: var(--space-6);
		left: 50%;
		transform: translateX(-50%);
		align-items: center;
	}

	@media (max-width: 768px) {
		.toaster {
			left: var(--space-3);
			right: var(--space-3);
			align-items: stretch;
			transform: none !important;
		}
		.toaster :global(.toast) {
			max-width: none;
		}
	}
</style>
