<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		onclose?: () => void;
		closeOnBackdrop?: boolean;
		children: Snippet;
		'aria-labelledby'?: string;
		'aria-label'?: string;
	};

	let {
		open,
		onclose,
		closeOnBackdrop = true,
		children,
		'aria-labelledby': ariaLabelledby,
		'aria-label': ariaLabel
	}: Props = $props();

	function handleBackdropClick() {
		if (closeOnBackdrop) onclose?.();
	}

	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onclose?.();
		};
		document.addEventListener('keydown', onKey);

		// Prevent body scroll while modal is open.
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
		};
	});
</script>

{#if open}
	<div class="modal-root" role="presentation">
		<button
			class="modal-backdrop"
			type="button"
			tabindex="-1"
			aria-label="Close modal"
			onclick={handleBackdropClick}
		></button>
		<div
			class="modal-frame"
			role="dialog"
			aria-modal="true"
			aria-labelledby={ariaLabelledby}
			aria-label={ariaLabel}
		>
			{@render children()}
		</div>
	</div>
{/if}

<style>
	.modal-root {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal, 40);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
	}

	.modal-backdrop {
		position: absolute;
		inset: 0;
		background-color: rgba(8, 10, 15, 0.55);
		backdrop-filter: blur(24px) saturate(1.2);
		-webkit-backdrop-filter: blur(24px) saturate(1.2);
		border: 0;
		padding: 0;
		cursor: pointer;
		/* Reset default button styling so the backdrop reads as a flat surface. */
		appearance: none;
	}

	/* The frame is a transparent positioning anchor — the consumer's child
	 * (WalletDialog / WalletPanel) brings its own background, radius, and size. */
	.modal-frame {
		position: relative;
		z-index: 1;
		max-height: calc(100dvh - 2 * var(--space-4));
		overflow-y: auto;
		/* Hide native scrollbar — modal stays scrollable but the bar is
		 * visually suppressed so it doesn't intrude on the panel chrome. */
		scrollbar-width: none;
	}
	.modal-frame::-webkit-scrollbar {
		width: 0;
		height: 0;
		display: none;
	}
</style>
