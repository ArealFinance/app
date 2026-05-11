<script lang="ts">
	/**
	 * Smooth count-up display for a numeric value.
	 *
	 * Whenever `value` changes, animates the rendered number from the
	 * previous displayed value to the new one via requestAnimationFrame.
	 * Default easing is `linear` — paired with a `durationMs` equal to the
	 * upstream poll interval, the displayed value moves at constant
	 * velocity from poll-to-poll instead of "snap forward then ease in".
	 * Pass `easing="easeOutCubic"` when you want the decelerating snap
	 * feel (one-shot transitions like wallet-balance updates).
	 *
	 * Output is always a decimal string with exactly `decimals` fractional
	 * digits, so successive frames don't jitter the layout width.
	 *
	 * Defaults match the portfolio "Unclaimed Rewards" pill: 1500 ms,
	 * linear, 6 RWT decimals — sync'd with `portfolio.store`'s 1.5 s poll.
	 */
	import { onDestroy } from 'svelte';

	type Easing = 'linear' | 'easeOutCubic';

	interface Props {
		/** Target value. Re-animates whenever this changes. */
		value: number;
		/** Number of fractional digits to render. Default 6 (RWT). */
		decimals?: number;
		/** Tween duration in milliseconds. Default 1500. */
		durationMs?: number;
		/**
		 * Easing curve. `linear` (default) for continuous-feed ticking;
		 * `easeOutCubic` for one-shot updates where deceleration reads
		 * as "settled".
		 */
		easing?: Easing;
	}

	let {
		value,
		decimals = 6,
		durationMs = 1500,
		easing = 'linear'
	}: Props = $props();

	// Start at 0 and let the first $effect run animate up to `value`. Reading
	// `value` in the `$state` initializer would only capture the prop's
	// initial value (Svelte's `state_referenced_locally` lint) — the prop
	// itself stays reactive, and the $effect below picks up every change.
	let displayed = $state(0);
	let raf: number | null = null;

	const EASING_FNS: Record<Easing, (t: number) => number> = {
		linear: (t) => t,
		easeOutCubic: (t) => 1 - Math.pow(1 - t, 3)
	};

	$effect(() => {
		// Capture target / starting point per re-run. `displayed` is mutated
		// inside `tick` — we read it ONCE here so the tween eases from
		// wherever the previous render landed (mid-animation re-targets stay
		// smooth instead of snapping).
		const target = value;
		const start = displayed;
		if (target === start) return;

		const startTime = performance.now();
		const ease = EASING_FNS[easing];
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / durationMs, 1);
			displayed = start + (target - start) * ease(t);
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
