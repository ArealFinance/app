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
	Phase 12.3.4 — auth-store states. Mirrors the live runes-backed AppShell
	props so designers / reviewers can see every state without booting the
	full app.
-->
<Story name="WalletConnectedNotSignedIn">
	<Header
		currentPath="/portfolio"
		walletAddress={DEMO_WALLET_ADDRESS}
		authStatus="signed-out"
		isSignedInForCurrentWallet={false}
	/>
</Story>

<Story name="Authenticating">
	<Header
		currentPath="/portfolio"
		walletAddress={DEMO_WALLET_ADDRESS}
		authStatus="authenticating"
		isSignedInForCurrentWallet={false}
	/>
</Story>

<Story name="SignedIn">
	<Header
		currentPath="/portfolio"
		walletAddress={DEMO_WALLET_ADDRESS}
		authStatus="signed-in"
		isSignedInForCurrentWallet={true}
	/>
</Story>

<Story name="Expired">
	<Header
		currentPath="/portfolio"
		walletAddress={DEMO_WALLET_ADDRESS}
		authStatus="expired"
		isSignedInForCurrentWallet={false}
	/>
</Story>
