<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DepthChart from './DepthChart.svelte';
	import type { DepthResult } from '@areal/sdk/markets';

	const fullDepth: DepthResult = {
		bidSide: [
			{ amountIn: 1_000n, amountOut: 998n, priceImpactBps: 5, pctOfReserve: 0.001 },
			{ amountIn: 5_000n, amountOut: 4_980n, priceImpactBps: 12, pctOfReserve: 0.005 },
			{ amountIn: 10_000n, amountOut: 9_950n, priceImpactBps: 25, pctOfReserve: 0.01 },
			{ amountIn: 25_000n, amountOut: 24_700n, priceImpactBps: 60, pctOfReserve: 0.025 },
			{ amountIn: 50_000n, amountOut: 49_000n, priceImpactBps: 120, pctOfReserve: 0.05 },
			{ amountIn: 100_000n, amountOut: 95_000n, priceImpactBps: 320, pctOfReserve: 0.1 },
			{ amountIn: 200_000n, amountOut: 180_000n, priceImpactBps: 600, pctOfReserve: 0.2 },
			{ amountIn: 350_000n, amountOut: 290_000n, priceImpactBps: 980, pctOfReserve: 0.35 }
		],
		askSide: [
			{ amountIn: 1_000n, amountOut: 998n, priceImpactBps: 5, pctOfReserve: 0.001 },
			{ amountIn: 5_000n, amountOut: 4_975n, priceImpactBps: 15, pctOfReserve: 0.005 },
			{ amountIn: 10_000n, amountOut: 9_900n, priceImpactBps: 30, pctOfReserve: 0.01 },
			{ amountIn: 25_000n, amountOut: 24_500n, priceImpactBps: 80, pctOfReserve: 0.025 },
			{ amountIn: 50_000n, amountOut: 48_500n, priceImpactBps: 160, pctOfReserve: 0.05 }
		]
	};

	const emptyDepth: DepthResult = { bidSide: [], askSide: [] };

	const oneSidedDepth: DepthResult = {
		bidSide: fullDepth.bidSide.slice(0, 4),
		askSide: []
	};

	// Args are intentionally minimal — Storybook serializes args for the
	// addon controls panel (and for snapshot via JSON.stringify) which
	// chokes on BigInt. The actual `depth` payload is wired per-Story
	// below, where it stays in component-local scope.
	const { Story } = defineMeta({
		title: 'Charts/DepthChart',
		component: DepthChart,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		args: { symbolA: 'RWT', symbolB: 'USDC' }
	});
</script>

<Story name="StandardPool">
	<div style="width: 540px;">
		<DepthChart depth={fullDepth} symbolA="RWT" symbolB="USDC" />
	</div>
</Story>

<Story name="ConcentratedEmpty">
	<div style="width: 540px;">
		<DepthChart depth={emptyDepth} symbolA="RWT" symbolB="USDC" />
	</div>
</Story>

<Story name="OneSided">
	<div style="width: 540px;">
		<DepthChart depth={oneSidedDepth} symbolA="RWT" symbolB="USDC" />
	</div>
</Story>
