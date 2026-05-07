<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import LpPositionDerived from './LpPositionDerived.svelte';

	const { Story } = defineMeta({
		title: 'Sections/LpPositionDerived',
		component: LpPositionDerived,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		args: { symbolA: 'USDC', symbolB: 'RWT', decimalsA: 6, decimalsB: 6 }
	});

	// The component reads `lpStore` + `poolStore` from $lib/markets singletons,
	// so the with-position story can't fabricate state from props alone.
	// The stories cover the three render branches that don't depend on store
	// activation: no-position (default singleton state) gets covered here.
	// Visual verification of the with-position branch is part of the
	// PoolDetailPanel storybook entry once a wallet + pool tuple is wired.
</script>

<Story name="NoPosition">
	<div style="width: 360px;">
		<LpPositionDerived symbolA="USDC" symbolB="RWT" decimalsA={6} decimalsB={6} />
	</div>
</Story>

<Story name="NoPositionUsdyRwt">
	<div style="width: 360px;">
		<LpPositionDerived symbolA="USDY" symbolB="RWT" decimalsA={6} decimalsB={6} />
	</div>
</Story>
