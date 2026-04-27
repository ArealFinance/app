<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';

	const upTrend = [10, 12, 11, 13, 16, 14, 18, 17, 20, 22, 21, 25];
	const downTrend = [25, 22, 23, 19, 21, 17, 18, 14, 12, 13, 10, 8];
	const flat = [12, 11, 12, 13, 12, 12, 13, 11, 12, 12, 13, 12];
	const wave = Array.from({ length: 40 }, (_, i) => Math.sin(i / 4) * 5 + 10 + i * 0.2);
	const big = Array.from(
		{ length: 60 },
		(_, i) => Math.sin(i / 8) * 12 + 25 + i * 0.5 + Math.random() * 3
	);

	const { Story } = defineMeta({
		title: 'Primitives/Chart',
		component: Chart,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			variant: { control: 'select', options: ['line', 'area', 'sparkline'] },
			color: { control: 'color' },
			strokeWidth: { control: 'number' },
			fillOpacity: { control: 'number' }
		},
		args: { data: upTrend, variant: 'line', strokeWidth: 2, fillOpacity: 0.18 }
	});
</script>

<Story name="Variants">
	<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; min-width: 720px;">
		<Card variant="surface" padding="md">
			<div
				style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--color-text-muted);margin-bottom:8px;"
			>
				line
			</div>
			<div style="height:80px;"><Chart data={upTrend} variant="line" /></div>
		</Card>
		<Card variant="surface" padding="md">
			<div
				style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--color-text-muted);margin-bottom:8px;"
			>
				area
			</div>
			<div style="height:80px;"><Chart data={upTrend} variant="area" /></div>
		</Card>
		<Card variant="surface" padding="md">
			<div
				style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:var(--color-text-muted);margin-bottom:8px;"
			>
				sparkline
			</div>
			<div style="height:32px;"><Chart data={upTrend} variant="sparkline" /></div>
		</Card>
	</div>
</Story>

<Story name="Tones">
	<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; min-width: 720px;">
		<Card variant="surface" padding="md">
			<div style="height:80px;"><Chart data={upTrend} variant="area" /></div>
		</Card>
		<Card variant="surface" padding="md">
			<div style="height:80px;">
				<Chart data={downTrend} variant="area" color="var(--color-danger)" />
			</div>
		</Card>
		<Card variant="surface" padding="md">
			<div style="height:80px;">
				<Chart data={wave} variant="area" color="var(--color-primary)" />
			</div>
		</Card>
		<Card variant="surface" padding="md">
			<div style="height:80px;">
				<Chart data={flat} variant="line" color="var(--color-text-muted)" />
			</div>
		</Card>
	</div>
</Story>

<Story name="Big">
	<div style="min-width: 480px; height: 200px;">
		<Card variant="surface" padding="md">
			<div style="height: 180px;"><Chart data={big} variant="area" /></div>
		</Card>
	</div>
</Story>
