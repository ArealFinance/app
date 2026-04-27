<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import WalletAddressChip from './WalletAddressChip.svelte';
	import { Clipboard, AngleDownSmall } from '$lib/icons';
	import { DEMO_WALLET_ADDRESS } from '$lib/constants';
	import { figmaDesign } from '$lib/figma';

	const { Story } = defineMeta({
		title: 'Primitives/WalletAddressChip',
		component: WalletAddressChip,
		tags: ['autodocs'],
		parameters: {
			layout: 'centered',
			design: figmaDesign('btnHeroChip')
		},
		argTypes: {
			size: { control: 'select', options: ['sm', 'md'] },
			status: { control: 'select', options: ['connected', 'disconnected'] },
			truncate: { control: 'number' },
			hideIcon: { control: 'boolean' },
			disabled: { control: 'boolean' }
		},
		args: {
			address: DEMO_WALLET_ADDRESS,
			size: 'md',
			status: 'connected',
			truncate: 4,
			hideIcon: false,
			disabled: false
		}
	});
</script>

<Story name="Sizes">
	<div style="display:flex; gap:12px; align-items: center;">
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} size="sm" />
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} size="md" />
	</div>
</Story>

<Story name="Disconnected">
	<div style="display:flex; gap:12px; align-items: center;">
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} size="sm" status="disconnected" />
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} size="md" status="disconnected" />
	</div>
</Story>

<Story name="Truncation">
	<div style="display:flex; gap:12px; flex-wrap: wrap;">
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} truncate={3} />
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} truncate={4} />
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} truncate={6} />
	</div>
</Story>

<Story name="DotColor">
	<div style="display:flex; gap:12px; flex-wrap: wrap;">
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} dotColor="#73ff83" />
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} dotColor="#ff8c00" />
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} dotColor="#d84347" />
	</div>
</Story>

<Story name="CustomIcon">
	<div style="display:flex; gap:12px; flex-wrap: wrap;">
		<WalletAddressChip address={DEMO_WALLET_ADDRESS}>
			{#snippet iconRight()}<AngleDownSmall size={14} />{/snippet}
		</WalletAddressChip>
		<WalletAddressChip address={DEMO_WALLET_ADDRESS}>
			{#snippet iconRight()}<Clipboard size={14} />{/snippet}
		</WalletAddressChip>
	</div>
</Story>

<Story name="HideIcon">
	<div style="display:flex; gap:12px;">
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} hideIcon />
		<WalletAddressChip address={DEMO_WALLET_ADDRESS} hideIcon size="sm" />
	</div>
</Story>

<Story name="AsLink">
	<WalletAddressChip address={DEMO_WALLET_ADDRESS} href="#wallet" />
</Story>
