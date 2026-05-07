<script lang="ts" module>
	export type SwapSettingsProps = {
		slippageBps: number;
		onslippagechange: (bps: number) => void;
	};
</script>

<script lang="ts">
	/*
	 * Slippage tolerance picker.
	 *
	 * Three preset chips (0.1% / 0.5% / 1%) plus a numeric "custom" input.
	 * Custom values are clamped to [0.1%, 5%] (10–500 bps) — outside that
	 * range the user almost certainly has a bug or is being tricked, so
	 * we silently clamp rather than allowing 50% slippage.
	 *
	 * `slippageBps` is the source of truth — comes from the quote store.
	 * Component emits `onslippagechange(bps)` for the parent to forward
	 * into `quote.setSlippage(bps)`. We deliberately don't reach into the
	 * store directly so the component stays composable.
	 *
	 * Bounds are imported from `$lib/swap/constants` so the store and the
	 * UI cannot drift; the component-side clamp is retained as
	 * defense-in-depth (covers stray callers that bypass the store).
	 */
	import { SLIPPAGE_MAX_BPS, SLIPPAGE_MIN_BPS } from '$lib/swap/constants';

	let { slippageBps, onslippagechange }: SwapSettingsProps = $props();

	const PRESETS: { bps: number; label: string }[] = [
		{ bps: 10, label: '0.1%' },
		{ bps: 50, label: '0.5%' },
		{ bps: 100, label: '1%' }
	];

	const MIN_BPS = SLIPPAGE_MIN_BPS;
	const MAX_BPS = SLIPPAGE_MAX_BPS;

	function formatBpsAsPercent(bps: number): string {
		return (bps / 100).toFixed(2).replace(/\.?0+$/, '');
	}

	// Custom input mirrors the active bps. Edit-buffer is a string to allow
	// in-progress typing of decimals (e.g. "0.7" while the user is still
	// typing). On blur we commit the parsed/clamped value back to the parent.
	let customStr = $state('');

	$effect(() => {
		// Keep the input in sync when the parent updates slippageBps from
		// outside (e.g. user picked a preset). This also fires on mount,
		// so we don't need a separate initialiser.
		customStr = formatBpsAsPercent(slippageBps);
	});

	function commitCustom() {
		const parsed = parseFloat(customStr);
		if (!Number.isFinite(parsed)) {
			// Reset display to the active value.
			customStr = formatBpsAsPercent(slippageBps);
			return;
		}
		const bps = Math.round(parsed * 100);
		const clamped = Math.max(MIN_BPS, Math.min(MAX_BPS, bps));
		onslippagechange(clamped);
		// Re-format in case the input was clamped or had trailing zeros.
		customStr = formatBpsAsPercent(clamped);
	}

	function pickPreset(bps: number) {
		onslippagechange(bps);
	}

	function isActive(bps: number): boolean {
		return slippageBps === bps;
	}
</script>

<div class="swap-settings">
	<header class="settings-head">
		<h3 class="settings-title">Slippage tolerance</h3>
		<p class="settings-sub">Maximum price change before the swap reverts.</p>
	</header>

	<div class="presets">
		{#each PRESETS as preset (preset.bps)}
			<button
				type="button"
				class="preset"
				class:active={isActive(preset.bps)}
				onclick={() => pickPreset(preset.bps)}
				aria-pressed={isActive(preset.bps)}
			>
				{preset.label}
			</button>
		{/each}

		<label class="custom">
			<input
				type="text"
				inputmode="decimal"
				class="custom-input"
				bind:value={customStr}
				onblur={commitCustom}
				onkeydown={(e) => {
					if (e.key === 'Enter') commitCustom();
				}}
				aria-label="Custom slippage tolerance, percent"
			/>
			<span class="custom-suffix">%</span>
		</label>
	</div>
</div>

<style>
	.swap-settings {
		min-width: 240px;
		padding: var(--space-3);
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-overlay);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.settings-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.settings-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.settings-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.presets {
		display: flex;
		gap: var(--space-2);
		align-items: stretch;
	}

	.preset {
		flex: 0 0 auto;
		height: 32px;
		padding: 0 var(--space-3);
		background-color: var(--color-surface-inset);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out);
	}
	.preset:hover {
		background-color: var(--color-dark-700);
	}
	.preset.active {
		border-color: var(--color-primary);
		background-color: var(--color-primary);
		color: var(--color-text);
	}

	.custom {
		flex: 1 1 0;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0 var(--space-2);
		background-color: var(--color-surface-inset);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		height: 32px;
	}
	.custom:focus-within {
		border-color: var(--color-primary);
	}
	.custom-input {
		flex: 1 1 0;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: none;
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-sm);
		color: var(--color-text);
		text-align: right;
	}
	.custom-suffix {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
