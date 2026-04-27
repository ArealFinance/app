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
	import { ChartPie, ArrowUpDownSimple, Chart } from '$lib/icons';
	import { WalletAddressChip } from '$lib/components/ui';
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
	};

	const defaultNav: NavItem[] = [
		{ label: 'Market', href: '/markets', icon: ChartPie, matchPrefix: ['/', '/markets'] },
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
		onWalletClick
	}: Props = $props();

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
								color={active ? 'var(--color-purple-100)' : 'var(--color-purple-400)'}
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
			{#if walletAddress}
				<WalletAddressChip
					address={walletAddress}
					status={walletStatus}
					size="sm"
					onclick={onWalletClick}
				/>
			{:else}
				<button class="connect-btn" type="button" onclick={onConnect}>Connect wallet</button>
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
		background-color: var(--color-surface-glass);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
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
		background-color: var(--color-gray-900-20);
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
	}

	.connect-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: var(--control-height-sm);
		padding: 0 var(--space-4);
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
	.connect-btn:hover {
		background-color: var(--color-purple-700);
	}

	@media (max-width: 768px) {
		.header-inner {
			grid-template-columns: auto auto;
			grid-template-rows: auto auto;
			height: auto;
			padding: var(--space-3);
			border-radius: var(--radius-xl);
		}
		.header-left {
			gap: var(--space-3);
		}
		.header-nav {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-content: center;
			width: 100%;
			padding-top: var(--space-2);
			border-top: 1px solid var(--color-border);
		}
		.header-center {
			display: none;
		}
		.header-right {
			justify-content: flex-end;
		}
	}
</style>
