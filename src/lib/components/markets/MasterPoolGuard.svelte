<script lang="ts">
	/*
	 * Master-pool advisory banner.
	 *
	 * Shown above the Add Liquidity / Zap form on protocol master pools
	 * (RWT/USDC, RWT/USDY) where end-user deposits are blocked at the
	 * contract level — liquidity is managed exclusively by the Liquidity
	 * Nexus rebalancer. The Withdraw tab stays enabled (and this banner
	 * doesn't render there) so existing LPs can always exit.
	 */

	type Props = {
		symbolA: string;
		symbolB: string;
	};

	let { symbolA, symbolB }: Props = $props();
</script>

<aside class="master-banner" role="note" aria-label="Protocol master pool">
	<svg class="master-icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
		<circle cx="9" cy="9" r="8" stroke="currentColor" stroke-width="1.5" fill="none" />
		<rect x="8.25" y="4" width="1.5" height="6.5" rx="0.75" fill="currentColor" />
		<circle cx="9" cy="13" r="0.9" fill="currentColor" />
	</svg>
	<div class="master-body">
		<p class="master-title">Protocol master pool</p>
		<p class="master-text">
			LP deposits are disabled on master pools. Liquidity for {symbolA}/{symbolB} is
			supplied by the Areal Liquidity Nexus to keep the AMM anchored to NAV.
			Withdrawals remain open.
		</p>
	</div>
</aside>

<style>
	.master-banner {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 16px;
		background-color: var(--color-accent-info-bg-soft);
		border: 1px solid var(--color-accent-info-border);
		border-radius: 16px;
		color: var(--color-accent-info);
	}
	.master-icon {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.master-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.master-title {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 13px;
		letter-spacing: -0.4px;
		color: var(--color-accent-info);
	}
	.master-text {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 12px;
		line-height: 1.45;
		letter-spacing: -0.3px;
		color: var(--color-text-muted);
	}
</style>
