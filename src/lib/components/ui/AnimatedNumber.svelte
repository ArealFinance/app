<script lang="ts">
	/**
	 * Smooth count-up display for a numeric value.
	 *
	 * Whenever `value` changes, eases the rendered number from the previous
	 * displayed value to the new one via requestAnimationFrame. Uses
	 * easeOutCubic so the tween decelerates as it converges — feels natural
	 * for "rewards tick" / "balance update" UX.
	 *
	 * Output is always a decimal string with exactly `decimals` fractional
	 * digits, so successive frames don't jitter the layout width.
	 *
	 * Defaults match the portfolio "Unclaimed Rewards" pill: 800 ms duration,
	 * 6 RWT decimals.
	 */
	import { onDestroy } from 'svelte';

	interface Props {
		/** Target value. Re-animates whenever this changes. */
		value: number;
		/** Number of fractional digits to render. Default 6 (RWT). */
		decimals?: number;
		/** Tween duration in milliseconds. Default 800. */
		durationMs?: number;
	}

	let { value, decimals = 6, durationMs = 800 }: Props = $props();

	// Start at 0 and let the first $effect run animate up to `value`. Reading
	// `value` in the `$state` initializer would only capture the prop's
	// initial value (Svelte's `state_referenced_locally` lint) — the prop
	// itself stays reactive, and the $effect below picks up every change.
	let displayed = $state(0);
	let raf: number | null = null;

	function easeOutCubic(t: number): number {
		return 1 - Math.pow(1 - t, 3);
	}

	$effect(() => {
		// Capture target / starting point per re-run. `displayed` is mutated
		// inside `tick` — we read it ONCE here so the tween eases from
		// wherever the previous render landed (mid-animation re-targets stay
		// smooth instead of snapping).
		const target = value;
		const start = displayed;
		if (target === start) return;

		const startTime = performance.now();
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / durationMs, 1);
			displayed = start + (target - start) * easeOutCubic(t);
			if (t < 1) {
				raf = requestAnimationFrame(tick);
			} else {
				raf = null;
			}
		};
		if (raf !== null) cancelAnimationFrame(raf);
		raf = requestAnimationFrame(tick);

		return () => {
			if (raf !== null) {
				cancelAnimationFrame(raf);
				raf = null;
			}
		};
	});

	onDestroy(() => {
		if (raf !== null) {
			cancelAnimationFrame(raf);
			raf = null;
		}
	});
</script>

<span>{displayed.toFixed(decimals)}</span>
