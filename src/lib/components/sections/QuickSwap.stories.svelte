<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import QuickSwap from './QuickSwap.svelte';
	import type { SwapToken } from './QuickSwap.svelte';

	const rwt: SwapToken = {
		id: 'rwt',
		symbol: 'RWT',
		bg: 'linear-gradient(135deg, #a56eff 0%, #602fdc 100%)',
		iconSrc: '/images/tokens/rwt-mark.svg'
	};

	const usdt: SwapToken = {
		id: 'usdt',
		symbol: 'USDt',
		bg: '#009393',
		iconSrc: '/images/tokens/usdt-t.svg'
	};

	const sprk: SwapToken = {
		id: 'sprk',
		symbol: 'SPRK',
		bg: '#4265ff',
		iconSrc: '/images/tokens/sparkles.svg'
	};

	const { Story } = defineMeta({
		title: 'Sections/QuickSwap',
		component: QuickSwap,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<Story name="Default">
	<div style="width: 324px;">
		<QuickSwap pinnedToken={rwt} initialOther={usdt} />
	</div>
</Story>

<Story name="PinnedTo">
	<div style="width: 324px;">
		<QuickSwap pinnedToken={rwt} pinnedSide="to" initialOther={usdt} />
	</div>
</Story>

<Story name="SparkPinned">
	<div style="width: 324px;">
		<QuickSwap pinnedToken={sprk} initialOther={usdt} />
	</div>
</Story>

<Story
	name="SettingsHint"
	parameters={{
		docs: {
			description: { story: 'Click the gear icon in the header to open Slippage Tolerance.' }
		}
	}}
>
	<div style="width: 324px;">
		<QuickSwap pinnedToken={rwt} initialOther={usdt} />
	</div>
</Story>
