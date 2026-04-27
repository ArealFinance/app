<script lang="ts">
	import { Xmark } from '$lib/icons';
	import { toast, type ToastEntry } from './toast-store';

	let { entry }: { entry: ToastEntry } = $props();
</script>

<div class="toast tone-{entry.tone}" role="status" aria-live="polite">
	<span class="toast-dot" aria-hidden="true"></span>
	<div class="toast-text">
		{#if entry.title}<div class="toast-title">{entry.title}</div>{/if}
		<div class="toast-body">{entry.body}</div>
	</div>
	<button
		type="button"
		class="toast-close"
		aria-label="Dismiss"
		onclick={() => toast.dismiss(entry.id)}
	>
		<Xmark size={14} />
	</button>
</div>

<style>
	.toast {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		min-width: 280px;
		max-width: 400px;
		padding: var(--space-3) var(--space-4);
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
		max-inline-size: 100%;
		font-size: var(--text-sm);
	}

	.toast-dot {
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		margin-top: 6px;
	}

	.tone-success .toast-dot {
		background-color: var(--color-success);
	}
	.tone-error .toast-dot {
		background-color: var(--color-danger);
	}
	.tone-warning .toast-dot {
		background-color: var(--color-warning);
	}
	.tone-info .toast-dot {
		background-color: var(--color-primary);
	}

	.toast-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.toast-title {
		font-weight: var(--font-weight-bold);
		font-size: var(--text-sm);
	}

	.toast-body {
		color: var(--color-text);
		word-break: break-word;
	}

	.toast-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border: 0;
		background: none;
		color: var(--color-text-muted);
		cursor: pointer;
		flex-shrink: 0;
		margin-top: 2px;
	}
	.toast-close:hover {
		color: var(--color-text);
	}
</style>
