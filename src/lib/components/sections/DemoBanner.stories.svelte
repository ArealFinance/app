<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import DemoBanner from './DemoBanner.svelte';

	const { Story } = defineMeta({
		title: 'Sections/DemoBanner',
		component: DemoBanner,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			tone: { control: 'select', options: ['warning', 'info', 'success', 'danger', 'neutral'] },
			dismissible: { control: 'boolean' }
		},
		args: { tone: 'warning', dismissible: false }
	});
</script>

<Story name="Default">
	<DemoBanner />
</Story>

<Story name="Dismissible">
	<DemoBanner dismissible storageKey="kit-preview-banner" />
</Story>

<Story name="Tones">
	<div style="display:flex; flex-direction: column; gap:12px;">
		<DemoBanner text="On mainnet soon — expect breaking changes" />
		<DemoBanner tone="info" text="Heads up — you're on testnet" />
		<DemoBanner tone="danger" text="Outage — claims are paused" />
	</div>
</Story>
