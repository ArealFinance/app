<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SwapSettings from './SwapSettings.svelte';

	const noop = (_bps: number) => {};

	const { Story } = defineMeta({
		title: 'Sections/SwapSettings',
		component: SwapSettings,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<Story name="DefaultPreset">
	<!-- 50 bps = 0.5% — the default the quote store starts with. -->
	<SwapSettings slippageBps={50} onslippagechange={noop} />
</Story>

<Story name="HighPreset">
	<!-- 100 bps = 1% — most aggressive preset. -->
	<SwapSettings slippageBps={100} onslippagechange={noop} />
</Story>

<Story name="CustomValue">
	<!--
		An off-preset custom value (75 bps = 0.75%). None of the preset chips
		render as active — the custom input shows the active value.
	-->
	<SwapSettings slippageBps={75} onslippagechange={noop} />
</Story>
