<script lang="ts" module>
	import type { NavItem } from './Header.svelte';
	export type { NavItem };
</script>

<script lang="ts">
	import { ChartPie, ArrowUpDownSimple, Chart, Plus } from '$lib/icons';

	type Props = {
		currentPath?: string;
		nav?: NavItem[];
	};

	const defaultNav: NavItem[] = [
		{ label: 'Market', href: '/markets', icon: ChartPie, matchPrefix: ['/', '/markets'] },
		{ label: 'Mint', href: '/mint', icon: Plus },
		{ label: 'Swap', href: '/swap', icon: ArrowUpDownSimple },
		{ label: 'Portfolio', href: '/portfolio', icon: Chart }
	];

	let { currentPath = '/', nav = defaultNav }: Props = $props();

	function isActive(item: NavItem): boolean {
		const raw = item.matchPrefix ?? item.href;
		const prefixes = Array.isArray(raw) ? raw : [raw];
		return prefixes.some((prefix) => {
			if (prefix === '/') return currentPath === '/';
			return currentPath === prefix || currentPath.startsWith(prefix + '/');
		});
	}
</script>

<!--
  Mobile bottom-fixed nav per Figma `MENU` (2002:8177).
  - Pill capsule centered horizontally, fixed near the bottom edge
  - Active item = white pill 48px tall with icon + label (Onest Bold 14)
  - Inactive items = 48×48 icon-only buttons (transparent bg)
  - Fade gradient above capsule via ::before for content readability
  - aria-label gives the nav semantic meaning; <a> tags expose route changes
-->
<nav class="mobile-nav" aria-label="Primary mobile">
	<ul class="mobile-nav-pill">
		{#each nav as item}
			{@const ActiveIcon = item.icon}
			{@const active = isActive(item)}
			<li class="mobile-nav-slot" class:active>
				<a
					href={item.href}
					class="mobile-nav-link"
					class:active
					aria-current={active ? 'page' : undefined}
					aria-label={item.label}
				>
					{#if ActiveIcon}
						<ActiveIcon
							size={active ? 18 : 24}
							variant="duotone"
							color={active ? 'var(--color-text-inverse)' : 'var(--color-purple-400)'}
						/>
					{/if}
					{#if active}
						<span class="mobile-nav-label">{item.label}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	/* Wrapper sits above page content with a fade-out gradient above the pill so
	 * scroll content fades behind the nav. `pointer-events: none` lets the fade
	 * area pass clicks through; the pill itself re-enables them. */
	.mobile-nav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: max(var(--space-3), env(safe-area-inset-bottom));
		display: flex;
		justify-content: center;
		padding: 0 var(--space-3);
		pointer-events: none;
		z-index: 20;
	}
	.mobile-nav::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: calc(100% + 56px); /* extends ~56px above pill */
		background: linear-gradient(
			to top,
			var(--color-bg) 35%,
			transparent
		);
		pointer-events: none;
		z-index: -1;
	}

	/* Per Figma `Rectangle 39659` (2002:8182): rounded-[24px] + backdrop-blur(16px).
	 * Bg uses the dark surface token at 70% to approximate the macet's dark
	 * frosted look without bundling the noisy texture image. */
	.mobile-nav-pill {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2); /* 8px between items per Figma */
		margin: 0;
		padding: 4px;
		background-color: rgba(8, 10, 15, 0.7);
		border-radius: 24px;
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		list-style: none;
	}

	.mobile-nav-slot {
		display: inline-flex;
	}

	/* Inactive — 48×48 icon-only, transparent. Per Figma `Rectangle 39660` slot. */
	.mobile-nav-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 48px;
		height: 48px;
		padding: 0;
		background-color: transparent;
		border: 0;
		border-radius: 20px;
		color: var(--color-text);
		text-decoration: none;
		transition:
			background-color var(--motion-base) var(--ease-out),
			color var(--motion-base) var(--ease-out);
	}
	.mobile-nav-link:hover {
		background-color: rgba(0, 0, 0, 0.3);
	}

	/* Active — white pill, dark text + icon. Per Figma `Главный экран` (2002:8183):
	 * 98×48, bg #FBF2FF, label Onest Bold 14 / -0.6px tracking. Width auto-grows
	 * for longer labels (e.g. "Portfolio") so the pill always hugs its content. */
	.mobile-nav-link.active {
		width: auto;
		padding: 0 16px;
		background-color: var(--color-white-900);
		color: var(--color-text-inverse);
	}
	.mobile-nav-link.active:hover {
		background-color: var(--color-white-900);
	}

	.mobile-nav-label {
		font-family: 'Onest', var(--font-sans);
		font-weight: var(--font-weight-bold);
		font-size: 14px;
		line-height: 1.4;
		letter-spacing: -0.6px;
		white-space: nowrap;
	}

	/* Hide on desktop — this nav is mobile-only. Header keeps the top nav above 768px. */
	@media (min-width: 769px) {
		.mobile-nav {
			display: none;
		}
	}
</style>
