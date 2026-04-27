<script lang="ts">
	import type { Snippet } from 'svelte';
	import Header from './Header.svelte';
	import Footer from './Footer.svelte';
	import type { NavItem } from './Header.svelte';
	import type { FooterColumn, FooterLink } from './Footer.svelte';

	type Props = {
		currentPath?: string;
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
</script>

<div class="shell">
	{#if !hideHeader}
		<Header
			{currentPath}
			{walletAddress}
			{walletStatus}
			{showDemoBanner}
			{nav}
			{onConnect}
			{onWalletClick}
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
			padding: var(--space-4) var(--space-3);
		}
	}
</style>
