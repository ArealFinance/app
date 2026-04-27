<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TabBar from './TabBar.svelte';
	import type { TabItem } from './TabBar.svelte';

	let active = $state('data-room');
	let disabledActive = $state('avail');

	const tokenTabs: TabItem[] = [
		{ label: 'Data Room', value: 'data-room' },
		{ label: 'Governance', value: 'governance' },
		{ label: "RWA's", value: 'rwa' }
	];
	const linkTabs: TabItem[] = [
		{ label: 'All', value: 'all', href: '#tab-all' },
		{ label: 'Protocol', value: 'protocol', href: '#tab-protocol' },
		{ label: 'Stocks', value: 'stocks', href: '#tab-stocks' }
	];
	const disabledTabs: TabItem[] = [
		{ label: 'Available', value: 'avail' },
		{ label: 'Coming soon', value: 'soon', disabled: true }
	];

	const { Story } = defineMeta({
		title: 'Sections/TabBar',
		component: TabBar,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<Story name="Stateful">
	<div style="display:flex; flex-direction: column; gap:12px;">
		<TabBar items={tokenTabs} value={active} onChange={(v) => (active = v)} />
		<div style="font-size:13px;color:var(--color-text-muted);">
			Active: <strong style="color:var(--color-text);">{active}</strong>
		</div>
	</div>
</Story>

<Story name="LinkMode">
	<TabBar items={linkTabs} value="protocol" />
</Story>

<Story name="WithDisabled">
	<TabBar
		items={disabledTabs}
		value={disabledActive}
		onChange={(v) => (disabledActive = v)}
	/>
</Story>
