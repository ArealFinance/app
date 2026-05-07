<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MarketsEmptyState from './MarketsEmptyState.svelte';

	const { Story } = defineMeta({
		title: 'Sections/MarketsEmptyState',
		component: MarketsEmptyState,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			variant: {
				control: 'select',
				options: ['mainnet-coming-soon', 'no-pools', 'no-token']
			}
		},
		args: { variant: 'no-pools' }
	});
</script>

<Story name="MainnetComingSoon">
	<div style="width: 540px;">
		<MarketsEmptyState variant="mainnet-coming-soon" />
	</div>
</Story>

<Story name="NoPools">
	<div style="width: 540px;">
		<MarketsEmptyState variant="no-pools" />
	</div>
</Story>

<Story name="NoToken">
	<div style="width: 540px;">
		<MarketsEmptyState variant="no-token" />
	</div>
</Story>

<Story name="WithCustomMessage">
	<div style="width: 540px;">
		<MarketsEmptyState
			variant="no-pools"
			message="Custom override copy — useful for narrowing the empty-state scope."
		/>
	</div>
</Story>
