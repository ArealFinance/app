<script lang="ts">
	import type { Snippet } from 'svelte';
	import Header from './Header.svelte';
	import Footer from './Footer.svelte';
	import MobileNav from './MobileNav.svelte';
	import type { NavItem } from './Header.svelte';
	import type { FooterColumn, FooterLink } from './Footer.svelte';
	import { WalletDialog, WalletPanel } from '$lib/components/wallet';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import { auth } from '$lib/auth';

	type Props = {
		currentPath?: string;
		/** Override (e.g. for Storybook). Live store address is used by default. */
		walletAddress?: string;
		walletStatus?: 'connected' | 'disconnected';
		showDemoBanner?: boolean;
		nav?: NavItem[];
		footerColumns?: FooterColumn[];
		footerLegal?: FooterLink[];
		copyright?: string;
		onConnect?: () => void;
		onWalletClick?: () => void;
		onSubscribe?: (email: string) => void;
		hideHeader?: boolean;
		hideFooter?: boolean;
		children?: Snippet;
	};

	let {
		currentPath,
		walletAddress,
		walletStatus,
		showDemoBanner,
		nav,
		footerColumns,
		footerLegal,
		copyright,
		onConnect,
		onWalletClick,
		onSubscribe,
		hideHeader = false,
		hideFooter = false,
		children
	}: Props = $props();

	// Default wiring: prop overrides win (stories), otherwise pull from store.
	const liveAddress = $derived(walletAddress ?? wallet.address ?? undefined);
	const liveStatus = $derived(
		walletStatus ?? (wallet.isConnected ? 'connected' : 'disconnected')
	);
	const liveOnConnect = $derived(onConnect ?? (() => walletDialog.open('connect')));
	const liveOnWalletClick = $derived(onWalletClick ?? (() => walletDialog.open('panel')));
	const liveAuthStatus = $derived(auth.status);
	const liveIsSignedInForCurrentWallet = $derived(auth.isSignedInForCurrentWallet);
	const liveOnSignIn = $derived(() => {
		void auth.signIn();
	});
</script>

<div class="shell">
	{#if !hideHeader}
		<Header
			{currentPath}
			walletAddress={liveAddress}
			walletStatus={liveStatus}
			{showDemoBanner}
			{nav}
			onConnect={liveOnConnect}
			onWalletClick={liveOnWalletClick}
			authStatus={liveAuthStatus}
			isSignedInForCurrentWallet={liveIsSignedInForCurrentWallet}
			onSignIn={liveOnSignIn}
		/>
	{/if}

	<main class="shell-main">
		{@render children?.()}
	</main>

	{#if !hideFooter}
		<Footer
			columns={footerColumns}
			legalLinks={footerLegal}
			{copyright}
			{onSubscribe}
		/>
	{/if}
</div>

<!-- Mobile bottom-fixed pill nav. Self-hides above 768px. -->
<MobileNav {currentPath} {nav} />

<WalletDialog />
<WalletPanel />

<style>
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.shell-main {
		position: relative;
		flex: 1;
		display: flex;
		flex-direction: column;
		max-width: var(--container-max);
		width: 100%;
		margin: 0 auto;
		/* Desktop: no horizontal padding — Figma container starts at x=113 with no
		 * inner inset. Mobile breakpoint below restores breathing room. */
		padding: var(--space-8) 0;
	}

	@media (max-width: 768px) {
		.shell-main {
			/* Bottom padding clears the fixed `<MobileNav>` (56px capsule + 12px
			 * bottom inset + 16px breathing room ≈ 84px). Includes safe-area
			 * for iOS home indicator. */
			padding: var(--space-4) var(--space-3)
				calc(84px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
