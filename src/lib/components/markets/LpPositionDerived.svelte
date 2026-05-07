<script lang="ts">
	/*
	 * Derived view of the holder's LP position in the active pool.
	 *
	 * Reads the pool's reserves + total LP shares (via `poolStore`) and the
	 * holder's `LpPosition.shares` (via `lpStore`) to compute pro-rata
	 * redemption amounts. This is the same math `remove_liquidity` runs on-
	 * chain (rounded down — never overstate the user's balance), so the
	 * preview here matches what the contract would actually pay out.
	 *
	 * Three render branches:
	 *   - loading        — lpStore is fetching the position account
	 *   - no-position    — wallet not connected, or LpPosition account
	 *                      doesn't exist, or shares == 0
	 *   - with-position  — full breakdown
	 */
	import { lpStore } from '$lib/markets/lp-store.svelte';
	import { poolStore } from '$lib/markets/pool-store.svelte';
	import { formatTokenAmount } from '$lib/markets/format';

	type Props = {
		symbolA: string;
		symbolB: string;
		decimalsA: number;
		decimalsB: number;
	};

	let { symbolA, symbolB, decimalsA, decimalsB }: Props = $props();

	const redeemed = $derived.by(() => {
		const lp = lpStore.position;
		const ps = poolStore.pool;
		if (!lp || !ps || ps.totalLpShares === 0n) return null;
		const a = (lp.shares * ps.reserveA) / ps.totalLpShares;
		const b = (lp.shares * ps.reserveB) / ps.totalLpShares;
		// `sharesPctBps` keeps the precision through the divide; convert to a
		// human percentage string at the boundary.
		const sharesPctBps = ps.totalLpShares > 0n
			? Number((lp.shares * 10_000n) / ps.totalLpShares)
			: 0;
		return {
			sharesPct: sharesPctBps / 100,
			a,
			b,
			shares: lp.shares
		};
	});
</script>

{#if lpStore.isLoading}
	<div class="lpd-loading">Loading position…</div>
{:else if !redeemed}
	<div class="lpd-empty">
		<p class="lpd-empty-title">No active position</p>
		<p class="lpd-empty-sub">Add liquidity below to start earning fees</p>
	</div>
{:else}
	<dl class="lpd">
		<div class="lpd-row">
			<dt class="lpd-label">Pool share</dt>
			<dd class="lpd-value">{redeemed.sharesPct.toFixed(2)}%</dd>
		</div>
		<div class="lpd-row">
			<dt class="lpd-label">{symbolA}</dt>
			<dd class="lpd-value">{formatTokenAmount(redeemed.a, decimalsA)}</dd>
		</div>
		<div class="lpd-row">
			<dt class="lpd-label">{symbolB}</dt>
			<dd class="lpd-value">{formatTokenAmount(redeemed.b, decimalsB)}</dd>
		</div>
	</dl>
{/if}

<style>
	.lpd {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
	}
	.lpd-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.lpd-label {
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
	.lpd-value {
		margin: 0;
		font-family: var(--font-numeric);
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.lpd-empty {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px 0;
	}
	.lpd-empty-title {
		margin: 0;
		font-family: var(--font-numeric);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.lpd-empty-sub {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}

	.lpd-loading {
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
</style>
