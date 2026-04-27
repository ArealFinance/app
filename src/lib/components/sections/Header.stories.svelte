<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Header from './Header.svelte';
	import { DEMO_WALLET_ADDRESS } from '$lib/constants';
	import { figmaDesign } from '$lib/figma';

	const { Story } = defineMeta({
		title: 'Sections/Header',
		component: Header,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			design: figmaDesign('headerHomepage')
		}
	});
</script>

<Story name="Connected">
	<Header currentPath="/markets" walletAddress={DEMO_WALLET_ADDRESS} />
</Story>

<Story name="SwapActive">
	<Header currentPath="/swap" walletAddress={DEMO_WALLET_ADDRESS} />
</Story>

<Story name="PortfolioActive">
	<Header currentPath="/portfolio" walletAddress={DEMO_WALLET_ADDRESS} />
</Story>

<Story name="Disconnected">
	<Header currentPath="/" />
</Story>

<Story name="WithoutDemoBanner">
	<Header
		currentPath="/markets"
		walletAddress={DEMO_WALLET_ADDRESS}
		showDemoBanner={false}
	/>
</Story>
