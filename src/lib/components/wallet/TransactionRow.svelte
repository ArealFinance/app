<script lang="ts">
	import { ArrowUpSmall, ArrowDownSmall, ArrowUpDownSimple } from '$lib/icons';
	import type { Transaction } from '$lib/stores/wallet.svelte';

	type Props = { tx: Transaction };
	let { tx }: Props = $props();

	const TYPE_CONFIG = {
		'add-lp': {
			label: 'Add LP',
			iconBg: 'rgba(115, 255, 131, 0.15)',
			iconColor: 'var(--color-green-900)' // #73FF83
		},
		swap: {
			label: 'Swap',
			iconBg: 'rgba(169, 132, 243, 0.2)',
			iconColor: '#a984f3' // purple-400
		},
		'withdraw-lp': {
			label: 'Withdraw LP',
			iconBg: 'rgba(255, 174, 134, 0.2)',
			iconColor: '#ffae86' // orange variant
		}
	} as const;

	const cfg = $derived(TYPE_CONFIG[tx.type]);
</script>

<div class="tx-row">
	<span class="tx-icon" style:background-color={cfg.iconBg} style:color={cfg.iconColor}>
		{#if tx.type === 'add-lp'}
			<ArrowUpSmall size={24} />
		{:else if tx.type === 'withdraw-lp'}
			<ArrowDownSmall size={24} />
		{:else}
			<ArrowUpDownSimple size={24} />
		{/if}
	</span>

	<div class="tx-meta">
		<div class="tx-label">{cfg.label}</div>
		<div class="tx-pair">
			<span class="tx-pair-logo tx-pair-logo-from" aria-hidden="true">
				<img src="/images/tokens/usdt-t.svg" alt="" loading="lazy" />
			</span>
			<span class="tx-pair-logo tx-pair-logo-to" aria-hidden="true">
				<img src="/images/tokens/rwt-mark.svg" alt="" loading="lazy" />
			</span>
			<span class="tx-pair-text">{tx.pair[0]} / {tx.pair[1]}</span>
		</div>
	</div>

	<div class="tx-values">
		<div class="tx-amount">{tx.amount}</div>
		<div class="tx-sub">
			<span class="tx-time">{tx.time}</span>
			<span class="tx-usd">{tx.usd}</span>
		</div>
	</div>
</div>

<style>
	.tx-row {
		display: grid;
		grid-template-columns: 48px 1fr auto;
		align-items: center;
		gap: var(--space-3);
		padding: 4px;
		background-color: rgba(255, 255, 255, 0.08);
		border-radius: 18px;
	}

	.tx-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 14px;
	}

	.tx-meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.tx-label {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.tx-pair {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: rgba(251, 242, 255, 0.7);
	}

	.tx-pair-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 8px;
		flex-shrink: 0;
		overflow: hidden;
	}
	.tx-pair-logo-from {
		background-color: #009393;
	}
	.tx-pair-logo-to {
		background-color: #9e60f6;
	}
	.tx-pair-logo img {
		width: 60%;
		height: 60%;
		object-fit: contain;
	}

	.tx-pair-text {
		margin-left: 4px;
		white-space: nowrap;
	}

	.tx-values {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		text-align: right;
	}

	.tx-amount {
		font-family: var(--font-body);
		font-size: var(--text-md); /* 16 */
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.tx-sub {
		display: inline-flex;
		gap: var(--space-2);
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
	}
	.tx-time {
		color: rgba(251, 242, 255, 0.4);
	}
	.tx-usd {
		color: rgba(251, 242, 255, 0.7);
	}
</style>
