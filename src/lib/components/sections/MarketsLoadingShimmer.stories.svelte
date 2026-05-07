<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MarketsLoadingShimmer from './MarketsLoadingShimmer.svelte';

	const { Story } = defineMeta({
		title: 'Sections/MarketsLoadingShimmer',
		component: MarketsLoadingShimmer,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			variant: { control: 'select', options: ['card', 'row'] }
		},
		args: { variant: 'card' }
	});
</script>

<Story name="Card">
	<div style="width: 293px;">
		<MarketsLoadingShimmer variant="card" />
	</div>
</Story>

<Story name="Row">
	<div style="width: 600px;">
		<MarketsLoadingShimmer variant="row" />
	</div>
</Story>

<Story name="CardGrid">
	<div style="display:grid; grid-template-columns: repeat(4, 293px); gap: 8px;">
		<MarketsLoadingShimmer variant="card" />
		<MarketsLoadingShimmer variant="card" />
		<MarketsLoadingShimmer variant="card" />
		<MarketsLoadingShimmer variant="card" />
	</div>
</Story>

<Story name="RowList">
	<div style="display:flex; flex-direction:column; gap:8px; width:600px;">
		<MarketsLoadingShimmer variant="row" />
		<MarketsLoadingShimmer variant="row" />
		<MarketsLoadingShimmer variant="row" />
	</div>
</Story>
