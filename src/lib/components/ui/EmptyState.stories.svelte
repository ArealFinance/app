<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import EmptyState from './EmptyState.svelte';
	import Button from './Button.svelte';
	import Card from './Card.svelte';
	import { ChartLine, Bolt, WalletSimple } from '$lib/icons';

	const { Story } = defineMeta({
		title: 'Primitives/EmptyState',
		component: EmptyState,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg'] } },
		args: { size: 'md', title: 'No active position', description: 'Add liquidity below to start.' }
	});
</script>

<Story name="WithCTA">
	<Card variant="surface">
		<div style="min-width: 480px;">
			<EmptyState
				title="No Active Position"
				description="Add liquidity below to start earning. Your positions will appear here."
			>
				{#snippet icon()}<ChartLine size={48} variant="duotone" />{/snippet}
				{#snippet action()}<Button variant="primary">Add Liquidity</Button>{/snippet}
			</EmptyState>
		</div>
	</Card>
</Story>

<Story name="ComingSoon">
	<Card variant="muted">
		<div style="min-width: 360px;">
			<EmptyState
				size="sm"
				title="Coming soon"
				description="Will be included in the next version."
			>
				{#snippet icon()}<Bolt size={28} variant="duotone" />{/snippet}
			</EmptyState>
		</div>
	</Card>
</Story>

<Story name="Sizes">
	<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; min-width: 760px;">
		<Card variant="surface">
			<EmptyState size="sm" title="Compact" description="Smallest variant.">
				{#snippet icon()}<WalletSimple size={20} />{/snippet}
			</EmptyState>
		</Card>
		<Card variant="surface">
			<EmptyState size="md" title="Default" description="Standard padding.">
				{#snippet icon()}<WalletSimple size={32} />{/snippet}
			</EmptyState>
		</Card>
		<Card variant="surface">
			<EmptyState size="lg" title="Hero" description="Full-page empty state.">
				{#snippet icon()}<WalletSimple size={56} variant="duotone" />{/snippet}
				{#snippet action()}<Button variant="primary">Connect</Button>{/snippet}
			</EmptyState>
		</Card>
	</div>
</Story>
