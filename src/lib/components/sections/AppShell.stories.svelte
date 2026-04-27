<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import AppShell from './AppShell.svelte';
	import Card from '../ui/Card.svelte';
	import Button from '../ui/Button.svelte';
	import { DEMO_WALLET_ADDRESS } from '$lib/constants';
	import { figmaDesign } from '$lib/figma';

	const { Story } = defineMeta({
		title: 'Sections/AppShell',
		component: AppShell,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			design: figmaDesign('homepageDesktop')
		}
	});
</script>

<Story name="Default">
	<AppShell currentPath="/markets" walletAddress={DEMO_WALLET_ADDRESS}>
		<Card variant="surface" padding="lg">
			<h2
				style="margin:0 0 12px;font-size:24px;letter-spacing:-0.04em;font-family:var(--font-sans);"
			>
				Page content goes here
			</h2>
			<p
				style="margin:0 0 16px;color:var(--color-text-muted);font-size:13px;line-height:1.6;font-family:var(--font-body);"
			>
				AppShell wraps your route's content. The Footer auto-sticks to viewport bottom on short
				pages thanks to flex layout.
			</p>
			<div style="display:flex; gap:12px;">
				<Button variant="primary">Primary action</Button>
				<Button variant="outline">Secondary</Button>
			</div>
		</Card>
	</AppShell>
</Story>

<Story name="HideFooter">
	<AppShell currentPath="/swap" walletAddress={DEMO_WALLET_ADDRESS} hideFooter>
		<Card variant="surface" padding="lg">
			<p style="margin:0;color:var(--color-text-muted);font-size:13px;font-family:var(--font-body);">
				Content area without footer (e.g., focused flow page).
			</p>
		</Card>
	</AppShell>
</Story>
