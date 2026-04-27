<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TokenList from './TokenList.svelte';
	import TokenRow from '../ui/TokenRow.svelte';
	import TokenAvatar from '../ui/TokenAvatar.svelte';
	import StatusPill from '../ui/StatusPill.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Button from '../ui/Button.svelte';
	import Chart from '../ui/Chart.svelte';
	import { ArrowUpRightSmall } from '$lib/icons';

	const upTrend = [10, 12, 11, 13, 16, 14, 18, 17, 20, 22, 21, 25];
	const downTrend = [25, 22, 23, 19, 21, 17, 18, 14, 12, 13, 10, 8];

	const { Story } = defineMeta({
		title: 'Sections/TokenList',
		component: TokenList,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<Story name="Default">
	<div style="min-width: 560px;">
		<TokenList>
			{#snippet header()}
				<span
					style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:var(--color-purple-900);"
				></span>
				Protocol
				<span
					style="display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 4px;background:var(--color-purple-900);color:var(--color-white-900);font-size:10px;border-radius:4px;margin-left:4px;"
				>3</span>
			{/snippet}

			<TokenRow name="Real World Token" symbol="RWT" amount="$0.9984">
				{#snippet icon()}<TokenAvatar symbol="A" tone="purple" />{/snippet}
				{#snippet chart()}<Chart data={upTrend} variant="sparkline" />{/snippet}
				{#snippet trailing()}
					<StatusPill variant="tonal" tone="success">+0.57%</StatusPill>
					<IconButton variant="ghost" size="sm" aria-label="Open">
						<ArrowUpRightSmall size={14} />
					</IconButton>
				{/snippet}
			</TokenRow>

			<TokenRow name="Sparkles" symbol="SPRK" amount="$0.4523">
				{#snippet icon()}<TokenAvatar symbol="S" tone="blue" />{/snippet}
				{#snippet chart()}
					<Chart data={downTrend} variant="sparkline" color="var(--color-danger)" />
				{/snippet}
				{#snippet trailing()}
					<StatusPill variant="tonal" tone="danger">−1.42%</StatusPill>
					<IconButton variant="ghost" size="sm" aria-label="Open">
						<ArrowUpRightSmall size={14} />
					</IconButton>
				{/snippet}
			</TokenRow>

			<TokenRow name="Tether USDt" symbol="USDt" amount="$1.0000">
				{#snippet icon()}<TokenAvatar symbol="T" tone="teal" />{/snippet}
				{#snippet trailing()}
					<StatusPill variant="tonal" tone="warning">±0.00%</StatusPill>
					<IconButton variant="ghost" size="sm" aria-label="Open">
						<ArrowUpRightSmall size={14} />
					</IconButton>
				{/snippet}
			</TokenRow>
		</TokenList>
	</div>
</Story>

<Story name="EmptyState">
	<div style="min-width: 560px;">
		<TokenList isEmpty emptyTitle="No tokens yet" emptyDescription="Connect a wallet to see your token holdings." />
	</div>
</Story>

<Story name="EmptyCustom">
	<div style="min-width: 560px;">
		<TokenList isEmpty>
			{#snippet empty()}
				<div
					style="display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:40px 24px;"
				>
					<h3 style="margin:0;font-size:20px;font-weight:700;">No active position</h3>
					<p style="margin:0 0 8px;color:var(--color-text-muted);font-size:13px;">
						Add liquidity below to start earning protocol revenue.
					</p>
					<Button variant="primary">Add Liquidity</Button>
				</div>
			{/snippet}
		</TokenList>
	</div>
</Story>
