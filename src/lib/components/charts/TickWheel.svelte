<script lang="ts">
	type Props = {
		/** Fraction of the wheel (0..1) coloured with `colorA`; remainder uses `colorB`. */
		value: number;
		colorA: string;
		colorB: string;
		/** Outer diameter in px. */
		size?: number;
		/** Total number of ticks around the circle. */
		tickCount?: number;
		/** Length of each tick (radial). */
		tickLength?: number;
		/** Stroke width of each tick. */
		tickWidth?: number;
		/** Where colorA starts, in degrees clockwise from 12 o'clock. Default 0 (top). */
		startAngle?: number;
	};

	let {
		value,
		colorA,
		colorB,
		size = 200,
		tickCount = 60,
		tickLength = 18,
		tickWidth = 4,
		startAngle = 0
	}: Props = $props();

	const cx = $derived(size / 2);
	const cy = $derived(size / 2);
	const outerR = $derived(size / 2 - tickWidth);
	const innerR = $derived(outerR - tickLength);

	const ticks = $derived(
		Array.from({ length: tickCount }, (_, i) => {
			// Place tick i at this angle (clockwise from 12 o'clock).
			const angleDeg = (i / tickCount) * 360 - 90 + startAngle;
			const angleRad = (angleDeg * Math.PI) / 180;
			const x1 = cx + innerR * Math.cos(angleRad);
			const y1 = cy + innerR * Math.sin(angleRad);
			const x2 = cx + outerR * Math.cos(angleRad);
			const y2 = cy + outerR * Math.sin(angleRad);
			// Group A occupies the first `value` fraction of ticks going CW
			// from the start angle.
			const inA = i < tickCount * value;
			return { x1, y1, x2, y2, color: inA ? colorA : colorB };
		})
	);
</script>

<svg viewBox="0 0 {size} {size}" width={size} height={size} aria-hidden="true">
	{#each ticks as t (t.x1 + ',' + t.y1)}
		<line
			x1={t.x1}
			y1={t.y1}
			x2={t.x2}
			y2={t.y2}
			stroke={t.color}
			stroke-width={tickWidth}
			stroke-linecap="round"
		/>
	{/each}
</svg>
