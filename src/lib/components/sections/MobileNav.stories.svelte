<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MobileNav from './MobileNav.svelte';

	const { Story } = defineMeta({
		title: 'Sections/MobileNav',
		component: MobileNav,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			viewport: { defaultViewport: 'mobile1' },
			docs: {
				description: {
					component:
						'Mobile bottom-fixed pill nav. Per Figma `MENU` (2002:8177). Active item is a white pill with icon + label; inactive items are 48×48 icon-only buttons. Hidden above 768px; pair with `Header` which hides its own nav at the same breakpoint. Includes a fade gradient above the pill so scrollable content blends out.'
				}
			}
		},
		argTypes: {
			currentPath: {
				control: 'select',
				options: ['/', '/markets', '/mint', '/swap', '/portfolio']
			}
		},
		args: {
			currentPath: '/markets'
		}
	});
</script>

<Story name="Default" args={{ currentPath: '/markets' }}>
	{#snippet template(args)}
		<div style="height: 100dvh; background: var(--color-bg); position: relative;">
			<MobileNav {...args} />
		</div>
	{/snippet}
</Story>

<Story name="MarketActive" args={{ currentPath: '/markets' }}>
	{#snippet template(args)}
		<div style="height: 100dvh; background: var(--color-bg); position: relative;">
			<MobileNav {...args} />
		</div>
	{/snippet}
</Story>

<Story name="MintActive" args={{ currentPath: '/mint' }}>
	{#snippet template(args)}
		<div style="height: 100dvh; background: var(--color-bg); position: relative;">
			<MobileNav {...args} />
		</div>
	{/snippet}
</Story>

<Story name="SwapActive" args={{ currentPath: '/swap' }}>
	{#snippet template(args)}
		<div style="height: 100dvh; background: var(--color-bg); position: relative;">
			<MobileNav {...args} />
		</div>
	{/snippet}
</Story>

<Story name="PortfolioActive" args={{ currentPath: '/portfolio' }}>
	{#snippet template(args)}
		<div style="height: 100dvh; background: var(--color-bg); position: relative;">
			<MobileNav {...args} />
		</div>
	{/snippet}
</Story>
