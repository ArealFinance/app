<script lang="ts" module>
	import type { Component } from 'svelte';

	/**
	 * Icon component shape — accepts at minimum `size`. Each Zappicon-generated
	 * icon also takes `variant` and `color`, but those are optional from a
	 * Header consumer's perspective.
	 */
	export type IconComponent = Component<{
		size?: number | string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		[key: string]: any;
	}>;

	export interface NavItem {
		label: string;
		href: string;
		icon?: IconComponent;
		matchPrefix?: string | string[]; // path(s) that activate this item (defaults to href)
	}
</script>

<script lang="ts">
	import { ChartPie, ArrowUpDownSimple, Chart, Plus, WalletSimple } from '$lib/icons';
	import { Button, WalletAddressChip } from '$lib/components/ui';
	import NetworkSwitcher from '$lib/components/debug/NetworkSwitcher.svelte';
	import DemoBanner from './DemoBanner.svelte';
	import Logo from './Logo.svelte';

	type Props = {
		currentPath?: string;
		walletAddress?: string;
		walletStatus?: 'connected' | 'disconnected';
		showDemoBanner?: boolean;
		nav?: NavItem[];
		onConnect?: () => void;
		onWalletClick?: () => void;
		/*
		 * Phase 12.3.4 — auth-store wiring. Optional so the live AppShell
		 * can pass the runes-backed values without each Storybook story
		 * having to remember them. Stories use the explicit overrides.
		 */
		authStatus?: 'signed-out' | 'signing' | 'authenticating' | 'signed-in' | 'expired' | 'error';
		isSignedInForCurrentWallet?: boolean;
		onSignIn?: () => void;
	};

	const defaultNav: NavItem[] = [
		{ label: 'Market', href: '/markets', icon: ChartPie, matchPrefix: ['/', '/markets'] },
		{ label: 'Mint', href: '/mint', icon: Plus },
		{ label: 'Swap', href: '/swap', icon: ArrowUpDownSimple },
		{ label: 'Portfolio', href: '/portfolio', icon: Chart }
	];

	let {
		currentPath = '/',
		walletAddress,
		walletStatus = 'connected',
		showDemoBanner = true,
		nav = defaultNav,
		onConnect,
		onWalletClick,
		authStatus = 'signed-out',
		isSignedInForCurrentWallet = false,
		onSignIn
	}: Props = $props();

	/*
	 * Show the explicit "Sign in" button only when:
	 *   - the wallet is connected (walletAddress present), AND
	 *   - we don't already have a valid session for that wallet, AND
	 *   - we're not mid-handshake (a spinner shows up instead).
	 *
	 * Auth is wallet-scoped — connecting a wallet is necessary but NOT
	 * sufficient to receive the per-wallet realtime room. The two-step
	 * UX makes the distinction explicit.
	 */
	const showSignInButton = $derived(
		!!walletAddress &&
			!isSignedInForCurrentWallet &&
			authStatus !== 'signing' &&
			authStatus !== 'authenticating'
	);
	const showAuthSpinner = $derived(
		!!walletAddress && (authStatus === 'signing' || authStatus === 'authenticating')
	);

	function isActive(item: NavItem): boolean {
		const raw = item.matchPrefix ?? item.href;
		const prefixes = Array.isArray(raw) ? raw : [raw];
		return prefixes.some((prefix) => {
			if (prefix === '/') return currentPath === '/';
			return currentPath === prefix || currentPath.startsWith(prefix + '/');
		});
	}
</script>

<header class="app-header">
	<div class="header-inner">
		<div class="header-left">
			<Logo />
			<nav class="header-nav" aria-label="Primary">
				{#each nav as item}
					{@const ActiveIcon = item.icon}
					{@const active = isActive(item)}
					<a
						href={item.href}
						class="nav-link"
						class:active
						aria-current={active ? 'page' : undefined}
					>
						{#if ActiveIcon}
							<ActiveIcon
								size={16}
								variant="duotone"
								color={active ? 'var(--color-text-inverse)' : 'var(--color-purple-400)'}
							/>
						{/if}
						<span>{item.label}</span>
					</a>
				{/each}
			</nav>
		</div>

		{#if showDemoBanner}
			<div class="header-center">
				<DemoBanner />
			</div>
		{/if}

		<div class="header-right">
			<div class="header-network-desktop">
				<NetworkSwitcher variant="chip" />
			</div>
			{#if walletAddress}
				{#if showSignInButton}
					<button class="signin-btn" type="button" onclick={onSignIn}>Sign in</button>
				{:else if showAuthSpinner}
					<span class="auth-chip" aria-live="polite">
						<span class="auth-spinner" aria-hidden="true"></span>
						<span>Signing in…</span>
					</span>
				{/if}
				<WalletAddressChip
					address={walletAddress}
					status={walletStatus}
					size="sm"
					onclick={onWalletClick}
				/>
			{:else}
				<Button variant="accent" size="lg" onclick={onConnect}>
					{#snippet iconLeft()}
						<WalletSimple size={18} variant="duotone" color="currentColor" />
					{/snippet}
					Connect Wallet
				</Button>
			{/if}
		</div>
	</div>
</header>

<style>
	.app-header {
		display: flex;
		justify-content: center;
		padding: var(--space-4) var(--space-4) 0;
	}

	.header-inner {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--space-4);
		width: 100%;
		max-width: var(--container-max);
		height: var(--header-height-desktop);
		padding: 0 var(--space-2) 0 var(--space-6);
		/* Figma: vertical gradient pill on top of backdrop-blur. Two stacked layers
		 * in the macet — we use the inner gradient (#1C1F30 → #111322) which is the
		 * dominant visible one. */
		background: linear-gradient(180deg, #1c1f30 0%, #111322 100%);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--space-6);
	}

	.header-nav {
		display: flex;
		align-items: center;
		gap: 0;
	}

	.nav-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 var(--space-3);
		height: 56px;
		font-family: 'Onest', var(--font-sans);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.6px;
		color: var(--color-text);
		border-radius: var(--radius-lg);
		text-decoration: none;
		transition:
			background-color var(--motion-base) var(--ease-out),
			color var(--motion-base) var(--ease-out);
	}
	.nav-link:hover {
		background-color: rgba(0, 0, 0, 0.3);
	}
	.nav-link.active {
		background-color: var(--color-white-900);
		color: var(--color-text-inverse);
	}
	.nav-link.active:hover {
		background-color: var(--color-white-900);
	}

	.header-center {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		min-width: 0;
		overflow: hidden;
		padding-right: var(--space-4);
	}

	.header-right {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	/* Network switcher is desktop-only in the header. Mobile gets it inside
	 * the wallet panel instead — saves horizontal space at 375px. */
	.header-network-desktop {
		display: inline-flex;
	}

	/*
	 * Sign-in button — distinct from connect (connect flips the wallet
	 * flow; this triggers the signature handshake). Uses the same primary
	 * accent so users recognise it as the next CTA in the flow.
	 */
	.signin-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: var(--control-height-sm);
		padding: 0 var(--space-3);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-white-900);
		background-color: var(--color-primary);
		border: 0;
		border-radius: var(--radius-lg);
		text-transform: uppercase;
		cursor: pointer;
		white-space: nowrap;
	}
	.signin-btn:hover {
		background-color: var(--color-purple-700);
	}

	.auth-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--control-height-sm);
		padding: 0 var(--space-3);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
		background-color: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		text-transform: uppercase;
		white-space: nowrap;
	}
	.auth-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		display: inline-block;
		animation: header-auth-spin 0.7s linear infinite;
	}
	@keyframes header-auth-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.header-inner {
			grid-template-columns: auto 1fr auto;
			height: auto;
			padding: var(--space-3);
			border-radius: var(--radius-xl);
		}
		.header-left {
			gap: var(--space-3);
		}
		/* Mobile: top nav is replaced by the bottom-fixed `<MobileNav>` per
		 * Figma `MENU` (2002:8177). Hidden here to avoid duplicate items. */
		.header-nav {
			display: none;
		}
		.header-center {
			display: none;
		}
		.header-right {
			justify-content: flex-end;
		}
		.header-network-desktop {
			display: none;
		}
	}
</style>
