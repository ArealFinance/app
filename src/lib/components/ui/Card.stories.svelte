<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Card from './Card.svelte';

	const { Story } = defineMeta({
		title: 'Primitives/Card',
		component: Card,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			variant: { control: 'select', options: ['surface', 'muted', 'outline', 'inset'] },
			padding: { control: 'select', options: ['none', 'sm', 'md', 'lg'] },
			radius: { control: 'select', options: ['md', 'lg', 'xl'] }
		},
		args: { variant: 'surface', padding: 'md', radius: 'xl' }
	});
</script>

<Story name="Default">
	<Card>
		<div style="min-width: 220px; color: var(--color-text);">
			<strong>Surface card</strong>
			<p style="margin: 4px 0 0; color: var(--color-text-muted); font-size: 13px;">
				Default Card primitive.
			</p>
		</div>
	</Card>
</Story>

<Story name="Variants">
	<div style="display: flex; gap: 16px; flex-wrap: wrap; max-width: 720px;">
		<Card variant="surface"><div style="min-width:160px;"><strong>surface</strong></div></Card>
		<Card variant="muted"><div style="min-width:160px;"><strong>muted</strong></div></Card>
		<Card variant="outline"><div style="min-width:160px;"><strong>outline</strong></div></Card>
		<Card variant="inset"><div style="min-width:160px;"><strong>inset</strong></div></Card>
	</div>
</Story>

<Story name="Padding">
	<div style="display: flex; gap: 16px; flex-wrap: wrap;">
		<Card padding="none"><div>none</div></Card>
		<Card padding="sm"><div>sm (16)</div></Card>
		<Card padding="md"><div>md (24)</div></Card>
		<Card padding="lg"><div>lg (32)</div></Card>
	</div>
</Story>

<Story name="Radius">
	<div style="display: flex; gap: 16px; flex-wrap: wrap;">
		<Card radius="md" padding="sm"><div>md (12)</div></Card>
		<Card radius="lg" padding="sm"><div>lg (20)</div></Card>
		<Card radius="xl" padding="sm"><div>xl (24)</div></Card>
	</div>
</Story>

<Story name="Composing">
	<Card variant="outline" padding="md">
		<div style="min-width: 360px;">
			<div
				style="display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:16px;"
			>
				<span
					style="width:8px;height:8px;border-radius:9999px;background:var(--color-purple-900);"
				></span>
				Protocol
			</div>
			<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
				<Card variant="surface" radius="lg" padding="sm">
					<strong>RWT</strong>
				</Card>
				<Card variant="surface" radius="lg" padding="sm">
					<strong>SPRK</strong>
				</Card>
			</div>
		</div>
	</Card>
</Story>
