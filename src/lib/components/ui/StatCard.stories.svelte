<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StatCard from './StatCard.svelte';
	import StatusPill from './StatusPill.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/StatCard',
		component: StatCard,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			size: { control: 'select', options: ['sm', 'md', 'lg'] },
			variant: { control: 'select', options: ['surface', 'muted', 'outline', 'inset'] }
		},
		args: { size: 'md', variant: 'surface', label: 'TVL', value: '$41.2K' }
	});
</script>

<Story name="Sizes">
	<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; min-width: 720px;">
		<StatCard label="TVL" value="$41.2K" size="sm" />
		<StatCard label="TVL" value="$41.2K" size="md" />
		<StatCard label="TVL" value="$41.2K" size="lg" />
	</div>
</Story>

<Story name="WithUnit">
	<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; min-width: 720px;">
		<StatCard label="APY" value="12.4" unit="%" />
		<StatCard label="Holders" value="5,000" />
		<StatCard label="Total value locked" value="41.2" unit="K" />
	</div>
</Story>

<Story name="WithFooter">
	<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; min-width: 720px;">
		<StatCard label="Price" value="$0.9984">
			{#snippet footer()}
				<StatusPill variant="tonal" tone="success">
					{#snippet iconLeft()}<span style="font-size:8px;">▲</span>{/snippet}
					0.57%
				</StatusPill>
				<StatusPill variant="neutral">24H</StatusPill>
			{/snippet}
		</StatCard>
		<StatCard label="24h change" value="+0.57%" />
		<StatCard label="Book NAV" value="$0.398" />
	</div>
</Story>

<Story name="Variants">
	<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; min-width: 720px;">
		<StatCard label="surface" value="$10.0K" variant="surface" />
		<StatCard label="muted" value="$10.0K" variant="muted" />
		<StatCard label="outline" value="$10.0K" variant="outline" />
		<StatCard label="inset" value="$10.0K" variant="inset" />
	</div>
</Story>

<Story name="WithChart">
	<div style="min-width: 360px;">
		<StatCard label="NAV growth" value="$41.2K" size="lg">
			{#snippet footer()}
				<StatusPill variant="tonal" tone="success">+12.4% YTD</StatusPill>
			{/snippet}
			{#snippet chart()}
				<svg viewBox="0 0 200 60" preserveAspectRatio="none" width="100%" height="60">
					<polyline
						points="0,50 25,40 50,45 75,30 100,32 125,18 150,20 175,8 200,12"
						fill="none"
						stroke="var(--color-success)"
						stroke-width="2"
					/>
				</svg>
			{/snippet}
		</StatCard>
	</div>
</Story>
