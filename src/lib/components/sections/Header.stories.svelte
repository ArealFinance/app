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

<!--
	The Header itself only renders two terminal states: signed-in (chip) or
	disconnected (Connect Wallet CTA). Intermediate auth states (signing,
	error, expired) are owned by the WalletDialog now — see its Phase B/C
	stories in `WalletDialog.stories.svelte`. AppShell does the wiring:
	when `auth.isSignedInForCurrentWallet` is true it forwards the address
	to Header; otherwise the address is undefined and the CTA is shown.
-->
<Story name="SignedIn">
	<Header currentPath="/portfolio" walletAddress={DEMO_WALLET_ADDRESS} />
</Story>
