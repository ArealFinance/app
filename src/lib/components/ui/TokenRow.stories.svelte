<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TokenRow from './TokenRow.svelte';
	import TokenAvatar from './TokenAvatar.svelte';
	import StatusPill from './StatusPill.svelte';
	import IconButton from './IconButton.svelte';
	import Card from './Card.svelte';
	import { ArrowUpRightSmall } from '$lib/icons';

	const { Story } = defineMeta({
		title: 'Primitives/TokenRow',
		component: TokenRow,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			size: { control: 'select', options: ['sm', 'md', 'lg'] }
		},
		args: { size: 'md', name: 'Real World Token', symbol: 'RWT', amount: '$0.9984' }
	});
</script>

<Story name="Sizes">
	<Card variant="surface" padding="none">
		<div style="min-width: 460px;">
			<TokenRow size="sm" name="Real World Token" symbol="RWT" amount="2,590" value="$2,590.00">
				{#snippet icon()}<TokenAvatar symbol="A" tone="purple" />{/snippet}
			</TokenRow>
			<TokenRow size="md" name="Sparkles" symbol="SPRK" amount="1,000" value="$1,420.00">
				{#snippet icon()}<TokenAvatar symbol="S" tone="blue" />{/snippet}
			</TokenRow>
			<TokenRow size="lg" name="Tether USDt" symbol="USDt" amount="1,200" value="$1,200.00">
				{#snippet icon()}<TokenAvatar symbol="T" tone="teal" />{/snippet}
			</TokenRow>
		</div>
	</Card>
</Story>

<Story name="WithChart">
	<Card variant="surface" padding="none">
		<div style="min-width: 460px;">
			<TokenRow name="Real World Token" symbol="RWT" amount="$0.9984">
				{#snippet icon()}<TokenAvatar symbol="A" tone="purple" />{/snippet}
				{#snippet chart()}
					<svg viewBox="0 0 80 32" preserveAspectRatio="none" width="100%" height="100%">
						<polyline
							points="0,24 10,20 20,22 30,16 40,18 50,10 60,12 70,4 80,8"
							fill="none"
							stroke="var(--color-success)"
							stroke-width="1.5"
						/>
					</svg>
				{/snippet}
			</TokenRow>
		</div>
	</Card>
</Story>

<Story name="WithTrailing">
	<Card variant="surface" padding="none">
		<div style="min-width: 460px;">
			<TokenRow name="Real World Token" symbol="RWT" href="#rwt">
				{#snippet icon()}<TokenAvatar symbol="A" tone="purple" />{/snippet}
				{#snippet trailing()}
					<StatusPill variant="tonal" tone="success">+0.57%</StatusPill>
					<IconButton variant="ghost" size="sm" aria-label="Open">
						<ArrowUpRightSmall size={14} />
					</IconButton>
				{/snippet}
			</TokenRow>
		</div>
	</Card>
</Story>

<Story name="Interactive">
	<Card variant="outline" padding="none">
		<div style="min-width: 460px;">
			<TokenRow name="Click me" symbol="CLICK" amount="$1.00" href="#click">
				{#snippet icon()}<TokenAvatar symbol="C" tone="magenta" />{/snippet}
			</TokenRow>
		</div>
	</Card>
</Story>
