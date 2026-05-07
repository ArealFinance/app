<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PoolMetricsCard from './PoolMetricsCard.svelte';

	const { Story } = defineMeta({
		title: 'Sections/PoolMetricsCard',
		component: PoolMetricsCard,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		args: {
			symbolA: 'RWT',
			symbolB: 'USDC',
			reserveA: '10.00K',
			reserveB: '9.95K',
			spotPrice: '1 RWT = 0.99 USDC',
			fee: '0.30%'
		}
	});
</script>

<Story name="Default">
	<div style="width: 444px;">
		<PoolMetricsCard
			symbolA="RWT"
			symbolB="USDC"
			reserveA="10.00K"
			reserveB="9.95K"
			spotPrice="1 RWT = 0.99 USDC"
			fee="0.30%"
		/>
	</div>
</Story>

<Story name="WithExtras">
	<div style="width: 444px;">
		<PoolMetricsCard
			symbolA="SPRK"
			symbolB="USDC"
			reserveA="125.45K"
			reserveB="125.07K"
			spotPrice="1 SPRK = 0.997 USDC"
			fee="0.30%"
			extra={[
				{ label: '24h Volume', value: '—' },
				{ label: '24h Fees', value: '—' }
			]}
		/>
	</div>
</Story>
