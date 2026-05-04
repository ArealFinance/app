<script lang="ts" module>
	export type AssetsDistributionPoint = {
		x: number;
		/** Top edge of the upper (purple) ribbon. 0..1 of chart height. */
		ownershipTop: number;
		/** Bottom edge of the upper ribbon. */
		ownershipBot: number;
		/** Top edge of the lower (pink) ribbon. */
		lpTop: number;
		/** Bottom edge of the lower ribbon. */
		lpBot: number;
	};
</script>

<script lang="ts">
	import { LayerCake, Svg } from 'layercake';
	import AssetsDistributionAreas from './AssetsDistributionAreas.svelte';

	type Props = {
		/** Series of points across time. Defaults to a 30-point mock curve. */
		data?: AssetsDistributionPoint[];
		/** Show a vertical 'current' marker on the right edge. */
		showMarker?: boolean;
	};

	let { data = generateMockData(), showMarker = true }: Props = $props();

	function generateMockData(): AssetsDistributionPoint[] {
		// Each ribbon has independent top + bot edges that CONVERGE toward
		// a shared central band on the right. On the LEFT both ribbons span
		// half the chart each (purple 0..0.5, pink 0.5..1); on the RIGHT
		// they shrink to the same central [0.35..0.65] band — there they
		// fully overlap and fill-opacity blends the two colours into a
		// lighter merged stripe. Smoothstep ease keeps the transition
		// monotonic and clean (no sinusoid).
		const N = 30;
		return Array.from({ length: N }, (_, i) => {
			const t = i / (N - 1);
			const ease = t * t * (3 - 2 * t);
			return {
				x: i,
				ownershipTop: 0 + 0.35 * ease,
				ownershipBot: 0.5 + 0.15 * ease,
				lpTop: 0.5 - 0.15 * ease,
				lpBot: 1 - 0.35 * ease
			};
		});
	}

	const xDomain = $derived<[number, number]>([data[0]?.x ?? 0, data[data.length - 1]?.x ?? 1]);
</script>

<div class="chart">
	<LayerCake padding={{ top: 0, right: 0, bottom: 0, left: 0 }} x="x" y="ownership" {data} {xDomain}>
		<Svg pointerEvents={false}>
			<AssetsDistributionAreas {showMarker} />
		</Svg>
	</LayerCake>
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		height: 140px;
	}
</style>
