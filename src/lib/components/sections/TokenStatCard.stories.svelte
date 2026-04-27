<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TokenStatCard from './TokenStatCard.svelte';
	import { figmaDesign } from '$lib/figma';

	const { Story } = defineMeta({
		title: 'Sections/TokenStatCard',
		component: TokenStatCard,
		tags: ['autodocs'],
		parameters: {
			layout: 'centered',
			design: figmaDesign('cardsSection')
		},
		argTypes: {
			state: { control: 'select', options: ['live', 'coming-soon'] },
			deltaTone: { control: 'select', options: ['success', 'danger'] }
		},
		args: {
			symbol: 'RWT',
			name: 'Real World Token',
			tvl: '$41.3k',
			price: '$0.9984',
			delta: '+0.57%',
			deltaTone: 'success',
			period: '24H',
			state: 'live'
		}
	});
</script>

<Story name="Default">
	<div style="width: 293px;">
		<TokenStatCard
			symbol="RWT"
			name="Real World Token"
			tvl="$41.3k"
			price="$0.9984"
			delta="+0.57%"
		/>
	</div>
</Story>

<Story name="Negative">
	<div style="width: 293px;">
		<TokenStatCard
			symbol="SPRK"
			name="Sparkles"
			tvl="$41.3k"
			price="$0.4523"
			delta="−1.42%"
			deltaTone="danger"
		/>
	</div>
</Story>

<Story name="ComingSoon">
	<div style="width: 293px;">
		<TokenStatCard symbol="RWT" name="Real World Token" state="coming-soon" />
	</div>
</Story>

<Story name="External">
	<div style="width: 293px;">
		<TokenStatCard
			symbol="SPRK"
			name="Sparkles"
			tvl="$41.3k"
			price="$0.9984"
			delta="+0.57%"
			href="/markets/sprk"
			external
		/>
	</div>
</Story>

<Story name="Grid">
	<div style="display:grid; grid-template-columns:repeat(4, 293px); gap:8px;">
		<TokenStatCard
			symbol="RWT"
			name="Real World Token"
			tvl="$41.3k"
			price="$0.9984"
			delta="+0.57%"
		/>
		<TokenStatCard
			symbol="SPRK"
			name="Sparkles"
			tvl="$41.3k"
			price="$0.4523"
			delta="−1.42%"
			deltaTone="danger"
		/>
		<TokenStatCard symbol="USDt" name="Tether USDt" tvl="$41.3k" price="$1.0000" delta="±0.00%" />
		<TokenStatCard symbol="RWT" name="Real World Token" state="coming-soon" />
	</div>
</Story>
