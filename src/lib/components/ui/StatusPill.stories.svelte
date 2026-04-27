<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StatusPill from './StatusPill.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/StatusPill',
		component: StatusPill,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			variant: { control: 'select', options: ['neutral', 'tonal', 'dot'] },
			tone: { control: 'select', options: ['success', 'warning', 'danger', 'info', 'neutral'] },
			size: { control: 'select', options: ['sm', 'md', 'lg'] }
		},
		args: { variant: 'tonal', tone: 'success', size: 'sm' }
	});
</script>

<Story name="Dot">
	<div style="display:flex; gap: 8px; flex-wrap: wrap;">
		<StatusPill variant="dot" tone="success">Stable</StatusPill>
		<StatusPill variant="dot" tone="info">Protocol</StatusPill>
		<StatusPill variant="dot" tone="warning">Pending</StatusPill>
		<StatusPill variant="dot" tone="danger">Halted</StatusPill>
		<StatusPill variant="dot" tone="neutral">Default</StatusPill>
	</div>
</Story>

<Story name="Tonal">
	<div style="display:flex; gap: 8px; flex-wrap: wrap;">
		<StatusPill variant="tonal" tone="success">
			{#snippet iconLeft()}<span style="font-size:8px;">▲</span>{/snippet}
			0.57%
		</StatusPill>
		<StatusPill variant="tonal" tone="danger">
			{#snippet iconLeft()}<span style="font-size:8px;">▼</span>{/snippet}
			1.42%
		</StatusPill>
		<StatusPill variant="tonal" tone="warning">Pending</StatusPill>
		<StatusPill variant="tonal" tone="info">In Range</StatusPill>
	</div>
</Story>

<Story name="Neutral">
	<div style="display:flex; gap: 8px;">
		<StatusPill variant="neutral">24H</StatusPill>
		<StatusPill variant="neutral">7D</StatusPill>
		<StatusPill variant="neutral">RWT</StatusPill>
	</div>
</Story>

<Story name="Sizes">
	<div style="display:flex; gap: 8px; align-items: center;">
		<StatusPill variant="tonal" tone="success" size="sm">SM</StatusPill>
		<StatusPill variant="tonal" tone="success" size="md">MD</StatusPill>
		<StatusPill variant="tonal" tone="success" size="lg">LG</StatusPill>
	</div>
</Story>

<Story name="LongPill">
	<StatusPill variant="dot" tone="warning" size="lg">
		Demo mode product is under active development
	</StatusPill>
</Story>
