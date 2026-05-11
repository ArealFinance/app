<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Rooms } from '@areal/sdk/realtime';
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import AssetsDistributionChart from '$lib/components/charts/AssetsDistributionChart.svelte';
	import TickWheel from '$lib/components/charts/TickWheel.svelte';
	import { Card, Picture } from '$lib/components/ui';
	import { ArrowUpSmall, Check, Xmark } from '$lib/icons';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { auth } from '$lib/auth';
	import { network } from '$lib/network/network.svelte';
	import { realtimeClient } from '$lib/realtime/client.svelte';
	import { toast } from '$lib/components/ui';
	import { portfolio, RWT_DECIMALS } from '$lib/portfolio/store.svelte';
	import { formatTokenAmount, formatUsd, formatPercent } from '$lib/portfolio/format';
	import { claims, type ClaimAttempt } from '$lib/portfolio/claim.svelte';
	import { historyStore } from '$lib/portfolio/history.svelte';
	import { lpPortfolio } from '$lib/portfolio/lp-portfolio-store.svelte';
	import { lpClaims } from '$lib/portfolio/lp-claim.svelte';
	import { priceFeed } from '$lib/portfolio/prices-store.svelte';
	import { markets } from '$lib/markets/store.svelte';
	import { ClaimConfirmModal, HistorySection } from '$lib/components/portfolio';
	import type { PortfolioRow } from '@areal/sdk/portfolio';
	import type { HolderLpRow } from '@areal/sdk/lp-portfolio';
	import { createTxToastHandler } from '$lib/portfolio/tx-toast';

	const isConnected = $derived(wallet.isConnected);

	type Tone = 'success' | 'danger';

	type OwnershipToken = {
		symbol: string;
		logoSrc?: string;
		logoLetter?: string;
		qty: string;
		apy: string;
		apyTone: Tone;
		price24h: string;
		price24hTone: Tone;
		price: string;
		value: string;
		row: PortfolioRow;
		canClaim: boolean;
	};

	// Phase 3 — token list is enriched with real APY (priceFeed), real USDC
	// price (markets snapshot), real USDC value (qty × price), and real 24h
	// change (priceFeed). All four collapse to '—' when the upstream value
	// is null. Tone is `success` when the value is ≥0 (or null — em-dash is
	// neutral, tone is irrelevant), `danger` when <0.
	const tokens = $derived<OwnershipToken[]>(
		portfolio.rows
			// Hide rows with a zero balance. portfolio.rows enumerates every OT
			// the holder has EVER had an associated token account for, so a
			// previously-emptied position would still show up at qty=0 — and a
			// brand-new OT discovered via the markets snapshot would show as
			// qty=0 even when the holder has never touched it. Surface only
			// what the user actually owns.
			.filter((row) => row.balance > 0n)
			.map((row) => {
			const tokenMeta = markets.snapshot?.tokens.find((t) => t.mint.equals(row.otMint));
			const priceUsdc = tokenMeta?.priceUsdc ?? null;
			const apy = priceFeed.apyForMint(row.otMint);
			const change = priceFeed.change24hForMint(row.otMint);

			// Convert raw bigint → human number for value calc. Sub-cent
			// dust is OK here — the value field is always rendered through
			// `formatUsd` which truncates display to two decimals.
			let valueUsdc: number | null = null;
			if (priceUsdc !== null) {
				const divisor = 10 ** row.metadata.decimals;
				const balanceFloat = Number(row.balance) / divisor;
				valueUsdc = balanceFloat * priceUsdc;
			}

			return {
				symbol: row.metadata.symbol,
				logoLetter: row.metadata.symbol.slice(0, 1).toUpperCase(),
				qty: formatTokenAmount(row.balance, row.metadata.decimals, 2),
				// `apyForMint` returns a backend ratio (1.0 = 100%); convert to
				// human-percent units (5.0 = 5%) for display via `formatPercent`.
				// `change24h` is already in percent units at the source — do
				// NOT convert it.
				apy: formatPercent(apy === null ? null : apy * 100, '0.00%'),
				apyTone: (apy !== null && apy < 0 ? 'danger' : 'success') as Tone,
				price24h: formatPercent(change, '0.00%'),
				price24hTone: (change !== null && change < 0 ? 'danger' : 'success') as Tone,
				price: priceUsdc !== null ? formatUsd(priceUsdc) : '$0.00',
				value: formatUsd(valueUsdc, '$0.00'),
				row,
				canClaim: row.distributor !== null && (row.claimableNow ?? 0n) > 0n
			};
		})
	);

	// Sum claimable across rows. When ANY row's claimable is unknown
	// (no proof published) we fall back to a dash — partial sums would
	// under-state the actual entitlement.
	const unclaimedRwt = $derived(
		portfolio.rows.reduce((sum, r) => sum + (r.claimableNow ?? 0n), 0n)
	);
	const claimableUnknown = $derived(portfolio.rows.some((r) => r.claimableNow === null));
	// RWT decimals are sourced from the RWT_DECIMALS constant; Phase 7 will
	// replace the constant with a runtime mint-metadata read.
	const unclaimedDisplay = $derived(formatTokenAmount(unclaimedRwt, RWT_DECIMALS, RWT_DECIMALS));

	// "Updated HH:MM:SS" — surfaced when the snapshot has a fetchedAt epoch.
	// `toLocaleTimeString()` defaults to the user's locale; no explicit format
	// to match because no other timestamp exists in the app yet.
	const lastUpdatedDisplay = $derived(
		portfolio.snapshot?.fetchedAt
			? new Date(portfolio.snapshot.fetchedAt).toLocaleTimeString()
			: ''
	);

	// Phase 3 — LP positions come from `lpPortfolio` store (on-chain).
	const lpRows = $derived(lpPortfolio.rows);

	// Selection lives by base58 string so the value survives row re-orders
	// (Svelte uses object identity for selection bindings; bigints in the
	// HolderLpRow shape would otherwise force us to compare by reference).
	let selectedLpId = $state<string | null>(null);
	$effect(() => {
		const ids = new Set(lpRows.map((r) => r.positionAddress.toBase58()));
		if (selectedLpId === null || !ids.has(selectedLpId)) {
			selectedLpId = lpRows[0]?.positionAddress.toBase58() ?? null;
		}
	});
	const selectedLpRow = $derived<HolderLpRow | null>(
		lpRows.find((r) => r.positionAddress.toBase58() === selectedLpId) ?? null
	);

	function lpRowApy(row: HolderLpRow): number | null {
		return priceFeed.rows.get(row.poolAddress.toBase58())?.apy24h ?? null;
	}

	function hasClaimableFees(row: HolderLpRow): boolean {
		return (
			row.pool.cumulativeFeesPerShareA > row.position.feesClaimedPerShareA ||
			row.pool.cumulativeFeesPerShareB > row.position.feesClaimedPerShareB
		);
	}

	function startClaimFees(row: HolderLpRow | null) {
		// `selectedLpRow` is `HolderLpRow | null` and the underlying store may
		// nullify it between render and click microtask (wallet switch,
		// WS-driven snapshot replacement). `lpClaims.start` no-ops on null.
		void lpClaims.start(row);
	}

	// ── Top-block totals ────────────────────────────────────────────────
	const tokensTotalUsdc = $derived(
		portfolio.rows.reduce((sum, row) => {
			const tokenMeta = markets.snapshot?.tokens.find((t) => t.mint.equals(row.otMint));
			const priceUsdc = tokenMeta?.priceUsdc ?? null;
			if (priceUsdc === null) return sum;
			const divisor = 10 ** row.metadata.decimals;
			return sum + (Number(row.balance) / divisor) * priceUsdc;
		}, 0)
	);
	const lpTotalUsdc = $derived(lpPortfolio.totalUsdc ?? 0);
	const totalValueUsd = $derived(tokensTotalUsdc + lpTotalUsdc);

	// ── Assets distribution buckets ────────────────────────────────────
	// OT side: bucket by `markets.snapshot.tokens[*].category` (protocol /
	// ownership / stock / unknown). LP side: single 'lp' bucket.
	interface CategoryBucket {
		key: string;
		label: string;
		usdc: number;
		pct: number;
		color: string;
	}
	const CATEGORY_COLORS: Record<string, string> = {
		ownership: '#A56EFF',
		lp: '#D844C6',
		protocol: '#1FB7B7',
		stock: '#FFB347',
		unknown: '#7E7190'
	};
	const CATEGORY_LABELS: Record<string, string> = {
		ownership: 'Ownership tokens',
		lp: 'LP',
		protocol: 'Protocol',
		stock: 'Stock OT',
		unknown: 'Other'
	};
	const categoryBuckets = $derived.by<CategoryBucket[]>(() => {
		const sums = new Map<string, number>();
		for (const row of portfolio.rows) {
			const tokenMeta = markets.snapshot?.tokens.find((t) => t.mint.equals(row.otMint));
			const priceUsdc = tokenMeta?.priceUsdc ?? null;
			if (priceUsdc === null) continue;
			const divisor = 10 ** row.metadata.decimals;
			const value = (Number(row.balance) / divisor) * priceUsdc;
			const key = tokenMeta?.category ?? 'unknown';
			sums.set(key, (sums.get(key) ?? 0) + value);
		}
		if (lpTotalUsdc > 0) sums.set('lp', (sums.get('lp') ?? 0) + lpTotalUsdc);
		const total = Array.from(sums.values()).reduce((a, b) => a + b, 0);
		const out: CategoryBucket[] = [];
		for (const [key, usdc] of sums) {
			if (usdc <= 0) continue;
			out.push({
				key,
				label: CATEGORY_LABELS[key] ?? key,
				usdc,
				pct: total > 0 ? (usdc / total) * 100 : 0,
				color: CATEGORY_COLORS[key] ?? '#7E7190'
			});
		}
		out.sort((a, b) => b.usdc - a.usdc);
		return out;
	});
	const categoryCount = $derived(categoryBuckets.length);
	const legendEntries = $derived(categoryBuckets);

	// ── Portfolio APY (USDC-weighted average) ──────────────────────────
	// Combines OT side (token mint × `apyForMint`) AND LP side (position's
	// pool's `apy24h`). Weighted by USDC value. Skip rows where either USDC
	// or APY is null. Returns null when denominator is 0.
	//
	// `apyForMint` and `lpRowApy` both return backend ratios (1.0 = 100%).
	// We scale by 100 here so `portfolioApy` is in human-percent units —
	// `formatPercent` then renders "5.00%" and `dailyIncomeDisplay` divides
	// by 100 to recover the ratio for the daily-income arithmetic.
	const portfolioApy = $derived.by<number | null>(() => {
		let weightedSum = 0;
		let totalWeight = 0;
		for (const row of portfolio.rows) {
			const tokenMeta = markets.snapshot?.tokens.find((t) => t.mint.equals(row.otMint));
			const priceUsdc = tokenMeta?.priceUsdc ?? null;
			if (priceUsdc === null) continue;
			const apyRatio = priceFeed.apyForMint(row.otMint);
			if (apyRatio === null) continue;
			const divisor = 10 ** row.metadata.decimals;
			const value = (Number(row.balance) / divisor) * priceUsdc;
			weightedSum += value * (apyRatio * 100);
			totalWeight += value;
		}
		for (const lpRow of lpRows) {
			const value = lpRow.valuation.totalUsdc;
			if (value === null) continue;
			const apyRatio = lpRowApy(lpRow);
			if (apyRatio === null) continue;
			weightedSum += value * (apyRatio * 100);
			totalWeight += value;
		}
		if (totalWeight === 0) return null;
		return weightedSum / totalWeight;
	});
	const portfolioApyDisplay = $derived(formatPercent(portfolioApy, '0.00%'));
	const dailyIncomeDisplay = $derived(
		portfolioApy !== null ? formatUsd((totalValueUsd * portfolioApy) / 100 / 365) : '$0.00'
	);

	// Backlog — portfolio-level 24h change requires a snapshot history
	// series the SDK does not yet surface. Render '0.00%' (concrete
	// zero rather than ambiguous dash) until then.
	const change24hDisplay = '0.00%';

	// Backlog — earning rate display (RWT/sec) requires distributor
	// emission_rate, which the SDK's holder-portfolio reader doesn't
	// surface. Render '0/sec' until then; do NOT compute snapshot deltas.
	const earningRateDisplay = '0/sec';

	// ── Phase 7: Claim wiring ────────────────────────────────────────────
	//
	// Aggregate "Claim" CTA selects the row with the highest `claimableNow`
	// (single-OT per tx in Phase 7; multi-OT batching is a Phase 7.x
	// follow-up). Ties broken by stable sort on `otMint.toBase58()` so
	// the choice is deterministic across renders.
	const claimableRows = $derived(
		portfolio.rows
			.filter((r) => r.distributor !== null && (r.claimableNow ?? 0n) > 0n)
			.slice()
			.sort((a, b) => {
				const da = b.claimableNow! - a.claimableNow!;
				if (da > 0n) return 1;
				if (da < 0n) return -1;
				return a.otMint.toBase58().localeCompare(b.otMint.toBase58());
			})
	);
	const aggregateRow = $derived<PortfolioRow | null>(claimableRows[0] ?? null);

	// Modal state — `modalRow` is the row we're confirming for; `modalAttempt`
	// is the live FSM attempt for that row (or null pre-confirm).
	let modalOpen = $state(false);
	let modalRow = $state<PortfolioRow | null>(null);

	const modalAttempt = $derived<ClaimAttempt | null>(
		modalRow ? (claims.attempts.get(modalRow.otMint.toBase58()) ?? null) : null
	);

	// Aggregate button state derives from the highest-claimable row's
	// in-flight attempt, OR from a generic "nothing to claim" empty state.
	const aggregateAttempt = $derived<ClaimAttempt | null>(
		aggregateRow ? (claims.attempts.get(aggregateRow.otMint.toBase58()) ?? null) : null
	);
	const aggregatePhase = $derived<ClaimAttempt['phase'] | 'idle-empty' | 'idle-claimable'>(
		aggregateAttempt
			? aggregateAttempt.phase
			: aggregateRow
				? 'idle-claimable'
				: 'idle-empty'
	);
	const aggregateLabel = $derived(
		aggregateRow
			? `Claim ${formatTokenAmount(aggregateRow.claimableNow ?? 0n, RWT_DECIMALS, RWT_DECIMALS)} RWT`
			: 'Nothing to claim'
	);

	function openClaimModal(row: PortfolioRow) {
		modalRow = row;
		modalOpen = true;
	}
	function closeClaimModal() {
		modalOpen = false;
		// Modal primitive uses {#if open} (no Svelte transition / exit animation),
		// so the dialog DOM unmounts in the same microtask — clearing modalRow
		// immediately is safe and removes a dead-code 200ms setTimeout.
		modalRow = null;
	}
	function confirmClaim() {
		if (!modalRow) return;
		void claims.start(modalRow);
	}

	// Lifecycle — stores handle wallet/network re-fires on their own.
	// `markets.start/stop` is NOT ref-counted, but SvelteKit page instances
	// don't coexist (each route's onDestroy fires before the next route's
	// onMount), so it's safe to bracket the lifetime per page. Same pattern
	// the markets pages already use.
	onMount(() => {
		portfolio.start();
		historyStore.start();
		lpPortfolio.start();
		markets.start();
		priceFeed.start();
	});
	onDestroy(() => {
		portfolio.stop();
		historyStore.stop();
		lpPortfolio.stop();
		markets.stop();
		priceFeed.stop();
	});

	/*
	 * Phase 12.3.4 — wallet-room toasts.
	 *
	 * When the user is signed-in for the currently connected wallet we
	 * subscribe to `wallet:<base58>` and surface a transaction confirmation
	 * toast. The realtime client gates wallet-room subscriptions behind
	 * `auth.isSignedInForCurrentWallet` already, but we mirror the check
	 * here so we don't even attach a listener while the session is invalid.
	 *
	 * The toast handler (validators, dedup, FIFO cap, visibility gate)
	 * lives in `$lib/portfolio/tx-toast.ts` so it can be unit-tested in
	 * isolation. See R-FU-5/6/7 for the rationale.
	 */
	const txToast = createTxToastHandler({ toast, network });

	$effect(() => {
		if (!wallet.isConnected) return;
		if (!auth.isSignedInForCurrentWallet) return;
		const pk = wallet.publicKey;
		if (!pk) return;

		const handle = realtimeClient.useRoom(Rooms.wallet(pk.toBase58()));
		const off = realtimeClient.on('transaction_indexed', txToast.handle);
		return () => {
			off();
			handle.off();
		};
	});
</script>

<svelte:head>
	<title>Portfolio · Areal</title>
	<meta name="description" content="Track and manage your DeFi positions on Areal." />
</svelte:head>

<AppShell currentPath="/portfolio">
	<div class="portfolio">
		<header class="portfolio-hero">
			<h1 class="portfolio-title">Portfolio</h1>
			<p class="portfolio-sub">Track and manage your DeFi positions</p>
		</header>

		{#if wallet.isConnected && auth.status === 'expired'}
			<!--
				Phase 12.3.4 — re-sign banner. Inline (not a Banner primitive)
				because Portfolio is the only consumer in this phase. If a
				second consumer appears, extract — until then, the inline
				block keeps the architecture flat.
			-->
			<div class="resign-banner resign-banner-warning" role="alert">
				<p class="resign-banner-text">
					Your session expired. Sign in again to receive transaction notifications.
				</p>
				<button
					type="button"
					class="resign-banner-btn"
					onclick={() => void auth.signIn()}>Sign in</button
				>
			</div>
		{:else if wallet.isConnected && auth.status === 'signed-out'}
			<div class="resign-banner resign-banner-info" role="status">
				<p class="resign-banner-text">Sign in to see live transaction updates.</p>
				<button
					type="button"
					class="resign-banner-btn"
					onclick={() => void auth.signIn()}>Sign in</button
				>
			</div>
		{/if}

		<div class="portfolio-grid" class:portfolio-grid-filled={isConnected}>
			<!-- ========== LEFT COLUMN ========== -->
			<Card variant="inset" radius="xl" padding="none" class="portfolio-aside">
				{#if !isConnected}
					<!-- Empty state KPI tile -->
					<div class="kpi-inner">
						<div class="kpi-block">
							<div class="kpi-label">Unclaimed Rewards</div>
							<div class="kpi-value">$0.00</div>
						</div>
						<div class="kpi-block">
							<div class="kpi-label">Total Value</div>
							<div class="kpi-value">$0.00</div>
						</div>
					</div>
				{:else}
					<!-- Filled. The horizontal 'cut' is a Figma Subtract:
					     base inner #080A0F (468x734, radius 20)
					     MINUS two strips (199x18 left + 199x18 right at y=423)
					     → result: two windows showing the outer #181A29, separated by
					     a 74px-wide connector bar of #080A0F that bridges the top and
					     bottom halves at their meeting line. We rebuild that with two
					     stacked sections (flat facing edges) + an absolute connector bar
					     in the gap. -->
					<div class="claim-shell">
						<!-- TOP section: unclaimed rewards + claim CTA -->
						<div class="claim-section claim-top">
							<div class="rewards-block">
								<div class="kpi-label">Unclaimed Rewards</div>
								<div class="rewards-row">
									<img
										class="reward-icon"
										src="/images/tokens/rwt-mark.svg"
										alt=""
										aria-hidden="true"
										loading="lazy"
									/>
									<span class="rewards-amount">
										{unclaimedDisplay}
									</span>
									<span class="rwt-pill">RWT</span>
								</div>
								<div class="rate-pill">
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M12 14l4-4" />
										<path d="M2 14a10 10 0 0 1 20 0" />
										<circle cx="12" cy="14" r="1.5" fill="currentColor" />
									</svg>
									<span>{earningRateDisplay}</span>
								</div>
							</div>

							<!--
								Aggregate Claim CTA — 8 visible states keyed off `aggregatePhase`.
								Disabled while in-flight or when nothing to claim.
							-->
							<button
								type="button"
								class="claim-btn claim-btn-{aggregatePhase}"
								disabled={aggregatePhase !== 'idle-claimable'}
								onclick={() => aggregateRow && openClaimModal(aggregateRow)}
							>
								{#if aggregatePhase === 'idle-empty'}
									<span>Nothing to claim</span>
								{:else if aggregatePhase === 'idle-claimable'}
									<Check size={16} />
									<span>{aggregateLabel}</span>
								{:else if aggregatePhase === 'preparing'}
									<span class="btn-spinner" aria-hidden="true"></span>
									<span>Preparing…</span>
								{:else if aggregatePhase === 'awaiting-signature'}
									<span class="btn-spinner" aria-hidden="true"></span>
									<span>Sign in wallet…</span>
								{:else if aggregatePhase === 'broadcasting'}
									<span class="btn-spinner" aria-hidden="true"></span>
									<span>Broadcasting…</span>
								{:else if aggregatePhase === 'confirming'}
									<span class="btn-spinner" aria-hidden="true"></span>
									<span>Confirming…</span>
								{:else if aggregatePhase === 'success'}
									<Check size={16} />
									<span>Claimed!</span>
								{:else if aggregatePhase === 'error'}
									<Xmark size={16} />
									<span>Failed</span>
								{/if}
							</button>
						</div>

						<!-- 18px gap-row with explicit cut overlays + a 74px central
						     connector. The cuts paint outer-mat colour at a z-level
						     above the crystal asset so the right cut stays visible
						     where the crystal silhouette would otherwise hide it. -->
						<div class="claim-gap-row" aria-hidden="true">
							<span class="claim-cut claim-cut-left"></span>
							<span class="claim-connector"></span>
							<span class="claim-cut claim-cut-right"></span>
						</div>

						<!-- BOTTOM section: total value, chart, legend, stats -->
						<div class="claim-section claim-bottom">
							<div class="rewards-block">
								<div class="kpi-label">Total Value</div>
								<div class="kpi-value">{formatUsd(totalValueUsd)}</div>
							</div>

							<div class="dist-section">
								<div class="dist-header">
									<span class="dist-title">Assets distribution</span>
									<span class="dist-count">
										<span class="dist-count-dot" aria-hidden="true"></span>
										<span>{categoryCount} categories</span>
									</span>
								</div>

								<!-- The chart curve is a presentational mock until the
								     backend exposes a portfolio snapshot history series.
								     The legend below is real-data driven. -->
								<AssetsDistributionChart />

								<div class="dist-legend">
									{#each legendEntries as entry (entry.key)}
										<div class="legend-row">
											<span
												class="legend-marker"
												style:color={entry.color}
											></span>
											<span class="legend-label">{entry.label}</span>
											<span class="legend-value">{formatUsd(entry.usdc)}</span>
											<span
												class="legend-pill"
												style:background-color="{entry.color}33"
												style:color={entry.color}
											>{entry.pct.toFixed(2)}%</span>
										</div>
									{/each}
								</div>
							</div>

							<div class="stats-row">
								<div class="stat-cell">
									<span class="stat-label">Portfolio APY</span>
									<span class="stat-value stat-value-positive">{portfolioApyDisplay}</span>
								</div>
								<div class="stat-cell">
									<span class="stat-label">Daily Income</span>
									<span class="stat-value stat-value-positive">{dailyIncomeDisplay}</span>
								</div>
								<div class="stat-cell">
									<!-- Backlog — portfolio-level 24h change requires a
									     snapshot history series the SDK does not yet
									     surface. -->
									<span class="stat-label">24h change</span>
									<span class="stat-value stat-value-positive">{change24hDisplay}</span>
								</div>
							</div>
						</div>

						<!-- Decorative crystal with baked-in aurora glow — TOPMOST layer
						     per Figma (claim card z-order: bg → cut → blur → button →
						     text → chart → CRYSTAL). The asset is 936x943 with the
						     crystal silhouette in the upper portion and a soft purple
						     aurora taking the lower half — no extra drop-shadow needed.
						     Sits over the upper-right corner of the card. -->
						<Picture
							class="claim-crystal"
							src="/images/hero/crystal-glow.png"
							alt=""
							width={936}
							height={943}
							loading="lazy"
						/>
					</div>
				{/if}
			</Card>

			<!-- ========== RIGHT COLUMN ========== -->
			<div class="portfolio-stack">
				<!-- Ownership tokens card -->
				<Card variant="inset" radius="xl" padding="none">
					<section class="section">
						<header class="section-head">
							<div class="section-head-left">
								<h2>Ownership tokens</h2>
								{#if isConnected && portfolio.isReady}
									<span class="count-badge count-badge-purple">{tokens.length}</span>
								{/if}
							</div>
							<div class="section-head-right">
								{#if isConnected && portfolio.isReady && lastUpdatedDisplay}
									<span class="last-updated">Updated {lastUpdatedDisplay}</span>
								{/if}
								{#if isConnected && portfolio.isReady && tokens.length > 0}
									<span class="section-total">~ {formatUsd(tokensTotalUsdc)}</span>
								{/if}
							</div>
						</header>
						<div
							class="section-body"
							class:section-body-table={isConnected && portfolio.isReady && tokens.length > 0}
						>
							{#if !isConnected}
								<img
									class="empty-illu"
									src="/images/portfolio/ownership-tokens-empty.svg"
									alt=""
									width="81"
									height="60"
									aria-hidden="true"
								/>
								<p class="empty-title">You do not currently hold any tokens</p>
								<p class="empty-sub">Start adding tokens</p>
							{:else if portfolio.isLoading && !portfolio.snapshot}
								<p class="empty-title">Loading…</p>
								<p class="empty-sub">Reading on-chain balances</p>
							{:else if portfolio.hasError}
								<p class="empty-title">Could not load portfolio</p>
								<p class="empty-sub">{portfolio.error}</p>
								<button
									type="button"
									class="retry-btn"
									onclick={() => portfolio.refresh()}>Retry</button
								>
							{:else if tokens.length === 0}
								<img
									class="empty-illu"
									src="/images/portfolio/ownership-tokens-empty.svg"
									alt=""
									width="81"
									height="60"
									aria-hidden="true"
								/>
								<p class="empty-title">You do not currently hold any tokens</p>
								<p class="empty-sub">Start adding tokens</p>
							{:else}
								<!-- Token table -->
								<div class="tt">
									<div class="tt-head">
										<div class="tt-cell tt-cell-asset">Asset</div>
										<div class="tt-cell tt-cell-qty">Qty</div>
										<div class="tt-cell tt-cell-apy">APY</div>
										<div class="tt-cell tt-cell-24h">Price 24h</div>
										<div class="tt-cell tt-cell-price">&nbsp;</div>
										<div class="tt-cell tt-cell-value">Value</div>
										<div class="tt-cell tt-cell-claim">&nbsp;</div>
									</div>
									{#each tokens as t (t.symbol)}
										{@const rowAttempt = claims.attempts.get(t.row.otMint.toBase58()) ?? null}
										<div class="tt-row">
											<div class="tt-cell tt-cell-asset">
												<span class="token-logo">
													{#if t.logoSrc}
														<img src={t.logoSrc} alt="" aria-hidden="true" loading="lazy" />
													{:else}
														<span class="token-letter">{t.logoLetter}</span>
													{/if}
												</span>
												<span class="token-symbol">{t.symbol}</span>
											</div>
											<div class="tt-cell tt-cell-qty">{t.qty}</div>
											<div class="tt-cell tt-cell-apy">
												<span class="apy-pill apy-pill-{t.apyTone}">{t.apy}</span>
											</div>
											<div class="tt-cell tt-cell-24h">
												<span class="apy-pill apy-pill-{t.price24hTone}">
													<span class="caret-icon" class:caret-down={t.price24hTone === 'danger'}>
														<ArrowUpSmall size={12} variant="filled" />
													</span>
													{t.price24h}
												</span>
											</div>
											<div class="tt-cell tt-cell-price">
												<span class="price-pill">{t.price}</span>
											</div>
											<div class="tt-cell tt-cell-value">{t.value}</div>
											<div class="tt-cell tt-cell-claim">
												{#if t.canClaim}
													<button
														type="button"
														class="row-claim-btn row-claim-btn-{rowAttempt?.phase ?? 'idle'}"
														disabled={rowAttempt !== null &&
															rowAttempt.phase !== 'success' &&
															rowAttempt.phase !== 'error'}
														onclick={() => openClaimModal(t.row)}
													>
														{#if rowAttempt === null}
															Claim
														{:else if rowAttempt.phase === 'preparing'}
															<span class="btn-spinner" aria-hidden="true"></span>
														{:else if rowAttempt.phase === 'awaiting-signature'}
															Sign…
														{:else if rowAttempt.phase === 'broadcasting' || rowAttempt.phase === 'confirming'}
															<span class="btn-spinner" aria-hidden="true"></span>
														{:else if rowAttempt.phase === 'success'}
															<Check size={14} />
														{:else if rowAttempt.phase === 'error'}
															<Xmark size={14} />
														{/if}
													</button>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</section>
				</Card>

				<!-- Liquidity positions card -->
				<Card variant="inset" radius="xl" padding="none">
					<section class="section">
						<header class="section-head">
							<div class="section-head-left">
								<h2>Liquidity positions</h2>
								{#if isConnected && lpPortfolio.isReady}
									<span class="count-badge count-badge-purple">{lpRows.length}</span>
								{/if}
							</div>
							{#if isConnected && lpPortfolio.isReady && lpRows.length > 0}
								<span class="section-total"
									>~ {lpPortfolio.totalUsdc !== null ? formatUsd(lpPortfolio.totalUsdc) : '—'}</span
								>
							{/if}
						</header>

						<div
							class="section-body"
							class:section-body-split={isConnected &&
								lpPortfolio.isReady &&
								lpRows.length > 0}
						>
							{#if !isConnected}
								<img
									class="empty-illu"
									src="/images/portfolio/lp-empty.svg"
									alt=""
									width="96"
									height="69"
									aria-hidden="true"
								/>
								<p class="empty-title">You do not currently hold any tokens</p>
								<p class="empty-sub">Start adding tokens</p>
							{:else if lpPortfolio.isLoading && !lpPortfolio.snapshot}
								<p class="empty-title">Loading…</p>
								<p class="empty-sub">Reading on-chain LP positions</p>
							{:else if lpPortfolio.hasError}
								<p class="empty-title">Could not load LP positions</p>
								<p class="empty-sub">{lpPortfolio.error}</p>
								<button
									type="button"
									class="retry-btn"
									onclick={() => lpPortfolio.refresh()}>Retry</button
								>
							{:else if lpRows.length === 0}
								<img
									class="empty-illu"
									src="/images/portfolio/lp-empty.svg"
									alt=""
									width="96"
									height="69"
									aria-hidden="true"
								/>
								<p class="empty-title">No LP positions yet</p>
								<p class="empty-sub">Provide liquidity to start earning fees</p>
							{:else}
								<!-- LEFT pane: positions list -->
								<div class="lp-list">
									{#each lpRows as row (row.positionAddress.toBase58())}
										{@const rowKey = row.positionAddress.toBase58()}
										{@const apyRatio = lpRowApy(row)}
										{@const apy = apyRatio === null ? null : apyRatio * 100}
										{@const apyTone = (apy !== null && apy < 0
											? 'danger'
											: 'success') as Tone}
										<button
											type="button"
											class="lp-item"
											class:lp-item-selected={selectedLpId === rowKey}
											onclick={() => (selectedLpId = rowKey)}
										>
											<!-- Letter-circle fallback for both sides — no
											     symbol→logo helper exists in-app yet, and the
											     hardcoded USDt/RWT icons would be wrong for
											     non-RWT pairs. -->
											<span class="lp-logos">
												<span class="lp-logo lp-logo-fallback">
													<span class="token-letter"
														>{row.symbolA.slice(0, 1).toUpperCase()}</span
													>
												</span>
												<span class="lp-logo lp-logo-overlap lp-logo-fallback">
													<span class="token-letter"
														>{row.symbolB.slice(0, 1).toUpperCase()}</span
													>
												</span>
											</span>
											<span class="lp-pair">{row.symbolA} / {row.symbolB}</span>
											<span class="apy-pill apy-pill-{apyTone} lp-apy">
												{#if apy !== null}
													{#if apyTone === 'success'}
														<span class="caret-icon"
															><ArrowUpSmall size={12} variant="filled" /></span
														>
													{:else}
														<span class="caret-icon caret-down"
															><ArrowUpSmall size={12} variant="filled" /></span
														>
													{/if}
												{/if}
												{formatPercent(apy)}
											</span>
										</button>
									{/each}
									<div class="lp-fade" aria-hidden="true"></div>
								</div>

								<!-- RIGHT pane: detail -->
								<div class="lp-detail">
									<header class="lp-detail-head">
										<h3>
											{selectedLpRow
												? `${selectedLpRow.symbolA} / ${selectedLpRow.symbolB}`
												: '—'}
										</h3>
									</header>
									<hr class="lp-detail-divider" aria-hidden="true" />

									<div class="lp-donut" aria-hidden="true">
										<!-- TickWheel value = ratioA (USDC share of side A,
										     0..1). Colours are the protocol identity (purple A
										     / teal B); per-pair theming is a backlog item. -->
										<TickWheel
											value={selectedLpRow?.valuation.ratioA ?? 0}
											colorA="#A56EFF"
											colorB="#1FB7B7"
											size={130}
											tickCount={50}
											tickLength={10}
											tickWidth={3}
										/>
										<div class="lp-donut-center">
											<span class="lp-donut-label">Your Position</span>
											<span class="lp-donut-value"
												>{formatUsd(selectedLpRow?.valuation.totalUsdc)}</span
											>
										</div>
									</div>

									<hr class="lp-detail-divider" aria-hidden="true" />

									{#if selectedLpRow}
										<div class="lp-detail-rows">
											<div class="lp-detail-row">
												<span class="lp-detail-marker lp-marker-purple"></span>
												<span class="lp-detail-symbol">{selectedLpRow.symbolA}</span>
												<span class="lp-detail-amount">
													<span class="lp-detail-qty"
														>{formatTokenAmount(
															selectedLpRow.valuation.amountA,
															selectedLpRow.decimalsA,
															2
														)}</span
													>
													<span class="lp-detail-usd"
														>{formatUsd(selectedLpRow.valuation.usdcA)}</span
													>
												</span>
												<span class="lp-detail-pill lp-pill-purple"
													>{selectedLpRow.valuation.pctA !== null
														? `${(selectedLpRow.valuation.pctA * 100).toFixed(0)}%`
														: '—'}</span
												>
											</div>
											<div class="lp-detail-row">
												<span class="lp-detail-marker lp-marker-teal"></span>
												<span class="lp-detail-symbol">{selectedLpRow.symbolB}</span>
												<span class="lp-detail-amount">
													<span class="lp-detail-qty"
														>{formatTokenAmount(
															selectedLpRow.valuation.amountB,
															selectedLpRow.decimalsB,
															2
														)}</span
													>
													<span class="lp-detail-usd"
														>{formatUsd(selectedLpRow.valuation.usdcB)}</span
													>
												</span>
												<span class="lp-detail-pill lp-pill-teal"
													>{selectedLpRow.valuation.pctB !== null
														? `${(selectedLpRow.valuation.pctB * 100).toFixed(0)}%`
														: '—'}</span
												>
											</div>
										</div>
									{/if}

									<div class="lp-detail-actions">
										<button type="button" class="lp-manage-btn">Manage</button>
										{#if selectedLpRow && hasClaimableFees(selectedLpRow)}
											{@const feeAttempt =
												lpClaims.attempts.get(selectedLpRow.positionAddress.toBase58()) ??
												null}
											<button
												type="button"
												class="lp-claim-fees-btn lp-claim-fees-btn-{feeAttempt?.phase ??
													'idle'}"
												disabled={feeAttempt !== null &&
													feeAttempt.phase !== 'success' &&
													feeAttempt.phase !== 'error'}
												onclick={() => startClaimFees(selectedLpRow)}
											>
												{#if feeAttempt === null}
													<Check size={14} />
													<span>Claim Fees</span>
												{:else if feeAttempt.phase === 'preparing'}
													<span class="btn-spinner" aria-hidden="true"></span>
													<span>Preparing…</span>
												{:else if feeAttempt.phase === 'awaiting-signature'}
													<span class="btn-spinner" aria-hidden="true"></span>
													<span>Sign in wallet…</span>
												{:else if feeAttempt.phase === 'broadcasting'}
													<span class="btn-spinner" aria-hidden="true"></span>
													<span>Broadcasting…</span>
												{:else if feeAttempt.phase === 'confirming'}
													<span class="btn-spinner" aria-hidden="true"></span>
													<span>Confirming…</span>
												{:else if feeAttempt.phase === 'success'}
													<Check size={14} />
													<span>Claimed!</span>
												{:else if feeAttempt.phase === 'error'}
													<Xmark size={14} />
													<span>Failed</span>
												{/if}
											</button>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</section>
				</Card>
			</div>
		</div>

		<!-- Phase 12.2.2 — Recent activity, full-width below the grid. -->
		<HistorySection />
	</div>

	<!-- Phase 7 — claim confirmation modal. Stays open across the entire
	     attempt lifecycle (preparing → success / error) so the user has a
	     persistent status surface; auto-dismisses on success after 3s. -->
	<ClaimConfirmModal
		open={modalOpen}
		onclose={closeClaimModal}
		onconfirm={confirmClaim}
		row={modalRow}
		attempt={modalAttempt}
	/>
</AppShell>

<style>
	.portfolio {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-6) 0 var(--space-12);
	}

	/* ---------- Re-sign banner (Phase 12.3.4) ---------- */
	.resign-banner {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border: 1px solid transparent;
		border-radius: var(--radius-lg);
	}
	.resign-banner-warning {
		background-color: var(--color-warning-tint);
		border-color: var(--color-warning);
		color: var(--color-text);
	}
	.resign-banner-info {
		background-color: var(--color-info-tint);
		border-color: var(--color-info);
		color: var(--color-text);
	}
	.resign-banner-text {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
	}
	.resign-banner-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: var(--control-height-sm);
		padding: 0 var(--space-4);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-white-900);
		background-color: var(--color-primary);
		border: 0;
		border-radius: var(--radius-md);
		cursor: pointer;
		white-space: nowrap;
	}
	.resign-banner-btn:hover {
		background-color: var(--color-purple-700);
	}

	/* ---------- Hero ---------- */
	.portfolio-hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.portfolio-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}
	.portfolio-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: -0.4px;
		color: var(--color-text);
	}

	/* ---------- Grid ---------- */
	.portfolio-grid {
		display: grid;
		grid-template-columns: minmax(0, 476px) minmax(0, 714px);
		gap: var(--space-6);
		align-items: start;
	}
	.portfolio-stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}
	:global(.portfolio-aside) {
		min-width: 0;
	}

	/* ---------- KPI tile (empty) ---------- */
	.kpi-inner {
		margin: 4px;
		min-height: 206px;
		padding: 24px;
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.kpi-block {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.kpi-label {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.kpi-value {
		font-family: 'Onest', var(--font-body);
		font-size: 32px;
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	/* ---------- Filled aside (claim + KPIs + chart + stats) ----------
	 * Re-creates the Figma Subtract: two fully-rounded section boxes
	 * separated by an 18px gap-row, with a 74px section-coloured
	 * connector bar bridging them through the centre of the gap.
	 *   - claim-top       → top section, all 4 corners rounded
	 *   - claim-gap-row   → 18px height, transparent; outer-mat colour
	 *                       shows through on either side of the connector
	 *   - claim-connector → 74px bar, section-coloured, centred in gap
	 *   - claim-bottom    → bottom section, all 4 corners rounded
	 * Result: two visible outer-mat 'windows' framed by the sections'
	 * naturally-curved bottom/top edges, exactly matching the boolean
	 * op in the source file. */
	.claim-shell {
		position: relative;
		margin: 4px;
		display: flex;
		flex-direction: column;
	}
	.claim-section {
		background-color: var(--color-surface);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.claim-top {
		/* All four corners rounded — outer top corners visually align with
		 * the Card's outer rounding; outer bottom corners create the
		 * filleted curve where the section meets the gap-row. */
		border-radius: var(--radius-lg);
	}
	.claim-bottom {
		border-radius: var(--radius-lg);
	}
	.claim-section .rewards-block {
		flex: 1;
	}

	.claim-gap-row {
		position: relative;
		height: 18px;
		/* z-index above the crystal asset so cut overlays + connector
		 * paint above it (the crystal silhouette would otherwise cover
		 * the right cut). */
		z-index: 9;
	}
	.claim-cut {
		position: absolute;
		top: 0;
		height: 18px;
		background-color: var(--color-surface-inset);
	}
	.claim-cut-left {
		left: 0;
		right: calc(50% + 37px);
	}
	.claim-cut-right {
		left: calc(50% + 37px);
		right: 0;
	}
	.claim-connector {
		/* 74px section-coloured strip bridging top and bottom sections
		 * vertically through the gap-row. Centred horizontally. */
		position: absolute;
		top: 0;
		left: calc(50% - 37px);
		width: 74px;
		height: 18px;
		background-color: var(--color-surface);
	}

	/* Crystal — fills claim-shell full width with baked-in aurora glow.
	 * Asset is 936x943: crystal silhouette in upper portion + soft glow
	 * filling the rest. Anchored top-right at 0,0 so the silhouette lines
	 * up with the upper-right of the card and the glow bleeds down across
	 * the cut into the upper part of the bottom section. No CSS drop-shadow
	 * — the asset carries it. Last DOM child of .claim-shell → paints on
	 * top of every section and the cut overlays.
	 * :global() lift: <Picture> wraps <img> in <picture display:contents>,
	 * so the .claim-crystal class lives on the <img> outside scoped reach. */
	:global(.claim-crystal) {
		position: absolute;
		top: 0;
		right: 0;
		width: 100%;
		height: auto;
		pointer-events: none;
	}

	.rewards-block {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.rewards-row {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.reward-icon {
		width: 20px;
		height: 20px;
		object-fit: contain;
	}
	.rewards-amount {
		font-family: 'Onest', var(--font-body);
		font-size: 32px;
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
		line-height: 1;
	}
	.rwt-pill {
		display: inline-flex;
		align-items: center;
		padding: 2px 6px;
		border: 1px solid rgba(113, 115, 144, 0.3);
		border-radius: 8px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.rate-pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		align-self: flex-start;
		padding: 2px 8px;
		background-color: var(--color-success-bg-strong);
		border-radius: 8px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-green-900);
	}

	.claim-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		height: 48px;
		width: 100%;
		max-width: 220px;
		background: transparent;
		border: 2px solid var(--color-green-900);
		border-radius: var(--radius-lg);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.claim-btn:hover:not(:disabled) {
		background-color: var(--color-success-bg-soft);
	}
	.claim-btn:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}
	.claim-btn :global(svg) {
		color: var(--color-green-900);
	}
	/* Phase-specific accents — keep the green outline as the resting state,
	 * but recolour for terminal states so the user can read the result at a
	 * glance without parsing the label. */
	.claim-btn-idle-empty {
		border-color: var(--color-border);
	}
	.claim-btn-error {
		border-color: var(--color-danger);
	}
	.claim-btn-error :global(svg) {
		color: var(--color-danger);
	}
	.claim-btn-success {
		background-color: var(--color-success-bg-medium);
	}

	/* Inline button spinner — shared by aggregate CTA and per-row buttons. */
	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: btn-spin 0.7s linear infinite;
		display: inline-block;
	}
	@keyframes btn-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Assets distribution */
	.dist-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.dist-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.dist-title {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.dist-count {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.dist-count-dot {
		width: 8px;
		height: 8px;
		border-radius: 3px;
		background-color: var(--color-text);
	}

	.dist-legend {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.legend-row {
		display: grid;
		grid-template-columns: 14px 1fr auto auto;
		align-items: center;
		gap: var(--space-3);
	}
	.legend-marker {
		width: 10px;
		height: 10px;
		border: 2px solid currentColor;
		border-radius: 4px;
	}
	.legend-purple {
		color: #a56eff;
	}
	.legend-pink {
		color: #d844c6;
	}
	.legend-label {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.legend-value {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.legend-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 64px;
		height: 32px;
		padding: 0 8px;
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
	}
	.legend-pill-purple {
		background-color: rgba(83, 67, 121, 0.5);
		color: #a984f3;
	}
	.legend-pill-pink {
		background-color: rgba(216, 68, 198, 0.2);
		color: #d844c6;
	}

	/* Stats row at bottom */
	.stats-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-surface-inset);
	}
	.stat-cell {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.stat-label {
		font-family: var(--font-body);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-muted);
	}
	.stat-value {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-family: var(--font-body);
		font-size: var(--text-md);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
	}
	.stat-value-positive {
		color: var(--color-green-900);
	}

	/* ---------- Section card ---------- */
	.section {
		margin: 4px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.section-head {
		padding: 20px 20px 16px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.section-head-left {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
	}
	.section-head h2 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}
	.count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 22px;
		padding: 0 8px;
		border-radius: 8px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.count-badge-purple {
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.section-total {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: #7e7190;
	}
	.section-head-right {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-3);
	}
	.last-updated {
		font-family: var(--font-body);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
	}

	.section-body {
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		min-height: 269px;
	}
	.section-body-table {
		/* Inner panel #080A0F shows only a 4px ring around the table
		 * substrate (.tt #181A29) per Figma. Override the default 24px
		 * body padding. */
		padding: 4px;
		min-height: auto;
		align-items: stretch;
		justify-content: flex-start;
	}
	.section-body-split {
		/* Override .section-body's bg + padding + radius — for split layout
		 * the inner panes are themselves cards, no wrapper bg/padding needed. */
		background-color: transparent;
		padding: 0;
		border-radius: 0;
		min-height: auto;
		align-items: stretch;
		justify-content: flex-start;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
	}

	.empty-illu {
		display: block;
		margin-bottom: var(--space-3);
	}
	.empty-title {
		margin: 0;
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
		text-align: center;
	}
	.empty-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
		text-align: center;
	}

	.retry-btn {
		margin-top: var(--space-3);
		padding: 8px 18px;
		background-color: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.retry-btn:hover {
		background-color: rgba(255, 255, 255, 0.04);
	}

	/* ---------- Token table ----------
	 * Figma layering for the table block:
	 *   1. .tt           — substrate #181A29 (Rectangle 39625 in dump)
	 *   2. .tt-head      — flat header strip on top of the substrate
	 *   3. .tt-row × N   — #080A0F cards (Rectangle 39626 × 4) sitting on
	 *                       the substrate with small gaps revealing it.
	 * Outer card variant="inset" stays as the OUTERMOST #181A29 frame;
	 * .section-body is the #080A0F panel that wraps everything below the
	 * section header. */
	.tt {
		display: flex;
		flex-direction: column;
		gap: 4px;
		background-color: var(--color-surface-inset);
		border-radius: 16px;
		/* Per Figma: table substrate inset ~4px from the inner panel,
		 * rows inset ~4px from the substrate (= padding here), 4px gap
		 * between rows (= column gap above). */
		padding: 4px;
	}
	.tt-head,
	.tt-row {
		display: grid;
		grid-template-columns: minmax(120px, 1.4fr) minmax(60px, 0.8fr) minmax(60px, 0.8fr) minmax(80px, 1fr) minmax(60px, 0.8fr) minmax(80px, 1fr) minmax(72px, 0.8fr);
		align-items: center;
		gap: var(--space-2);
		padding: 12px 16px;
	}
	.tt-head {
		padding: 8px 16px;
	}
	.tt-row {
		background-color: var(--color-surface);
		border-radius: 12px;
	}
	.tt-cell {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.tt-head .tt-cell {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.tt-cell-asset {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.tt-cell-value {
		text-align: right;
	}
	.tt-cell-claim {
		display: flex;
		justify-content: flex-end;
	}
	/* Per-row claim button. Compact pill shape, defaults to ghost with green
	 * accent, swaps colour on terminal states to mirror the aggregate CTA. */
	.row-claim-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 56px;
		height: 28px;
		padding: 0 10px;
		background: transparent;
		border: 1px solid var(--color-green-900);
		border-radius: var(--radius-md);
		color: var(--color-green-900);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.row-claim-btn:hover:not(:disabled) {
		background-color: var(--color-success-bg-faint);
	}
	.row-claim-btn:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}
	.row-claim-btn-error {
		border-color: var(--color-danger);
		color: var(--color-danger);
	}
	.row-claim-btn-success {
		background-color: var(--color-success-bg-medium);
	}
	.token-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 9px;
		flex-shrink: 0;
		overflow: hidden;
		background-color: var(--color-token-logo-fallback-bg);
	}
	.token-logo img {
		width: 60%;
		height: 60%;
		object-fit: contain;
	}
	.token-letter {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: var(--font-weight-bold);
		color: white;
	}
	.token-symbol {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
	}
	.apy-pill {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 4px 10px;
		border-radius: 8px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
	}
	.apy-pill-success {
		background-color: var(--color-success-bg-strong);
		color: var(--color-green-900);
	}
	.apy-pill-danger {
		background-color: rgba(255, 0, 136, 0.15);
		color: #ff0088;
	}
	.caret-icon {
		display: inline-flex;
		align-items: center;
	}
	.caret-icon.caret-down {
		transform: rotate(180deg);
	}
	.price-pill {
		display: inline-flex;
		padding: 4px 10px;
		border: 1px solid rgba(113, 115, 144, 0.25);
		border-radius: 8px;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
	}

	/* ---------- LP positions list ---------- */
	.lp-list {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 460px;
		overflow-y: auto;
		padding: 16px;
		background-color: var(--color-surface);
		border-radius: 16px;
		/* Subtle hairline + ambient shadow lift the pane off the substrate. */
		border: 1px solid rgba(255, 255, 255, 0.04);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}
	.lp-item {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--space-3);
		padding: 14px 16px;
		/* Non-selected rows are transparent over the pane #080A0F per
		 * Figma — only text + logos are visible. Border 1px transparent
		 * holds box dimensions identical to the selected state so layout
		 * doesn't jump on selection. */
		background-color: transparent;
		border: 1px solid transparent;
		border-radius: 16px;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--color-text);
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out),
			box-shadow var(--motion-base) var(--ease-out);
	}
	.lp-item:hover:not(.lp-item-selected) {
		background-color: rgba(255, 255, 255, 0.03);
	}
	.lp-item-selected {
		background-color: var(--color-surface-inset);
		border-color: #6e97ff;
		box-shadow: 0 0 8px rgba(110, 151, 255, 0.8);
	}
	/* Hairline separator between adjacent rows — a 1px strip ABOVE the
	 * non-first rows, inset from horizontal edges so it reads as a
	 * subtle divider rather than a full-width line. Hidden when either
	 * the row above OR the row itself is selected (selected row's
	 * border + glow already act as visual separator). */
	.lp-item + .lp-item::before {
		content: '';
		position: absolute;
		top: -1px;
		left: 16px;
		right: 16px;
		height: 1px;
		background-color: var(--color-surface-inset);
		pointer-events: none;
	}
	.lp-item-selected::before,
	.lp-item-selected + .lp-item::before {
		display: none;
	}
	.lp-logos {
		display: inline-flex;
		align-items: center;
	}
	.lp-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 10px;
		overflow: hidden;
	}
	.lp-logo-overlap {
		margin-left: -8px;
		border: 2px solid var(--color-surface-inset);
	}
	.lp-pair {
		font-family: var(--font-body);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
	}
	.lp-apy {
		justify-self: end;
	}
	.lp-fade {
		position: sticky;
		bottom: 0;
		left: 0;
		right: 0;
		height: 32px;
		margin-top: -32px;
		background: linear-gradient(180deg, transparent 0%, var(--color-surface) 100%);
		pointer-events: none;
	}

	/* ---------- LP detail pane ---------- */
	.lp-detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: 16px;
		background-color: var(--color-surface);
		border-radius: 16px;
		/* Match .lp-list elevation so both panes read as the same layer
		 * floating above the substrate. */
		border: 1px solid rgba(255, 255, 255, 0.04);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}
	.lp-detail-head h3 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.lp-detail-divider {
		margin: 0;
		border: 0;
		height: 1px;
		background-color: var(--color-border);
	}

	.lp-donut {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-3) 0;
	}
	.lp-donut-center {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		text-align: center;
	}
	.lp-donut-label {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
	.lp-donut-value {
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.lp-detail-rows {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.lp-detail-row {
		display: grid;
		grid-template-columns: 12px auto 1fr auto;
		column-gap: var(--space-3);
		align-items: center;
	}
	.lp-detail-marker {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
	.lp-marker-purple {
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.lp-marker-teal {
		background-color: #009393;
	}
	.lp-detail-symbol {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.lp-detail-amount {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}
	.lp-detail-qty {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.lp-detail-usd {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-muted);
	}
	.lp-detail-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 50px;
		height: 24px;
		padding: 0 8px;
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
	}
	.lp-pill-purple {
		background-color: rgba(83, 67, 121, 0.5);
		color: #a984f3;
	}
	.lp-pill-teal {
		background-color: rgba(0, 147, 147, 0.25);
		color: #009393;
	}

	.lp-manage-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 48px;
		background-color: var(--color-white-900);
		color: var(--color-text-inverse);
		border: 0;
		border-radius: var(--radius-lg);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		cursor: pointer;
		flex: 1;
	}

	/* LP detail action row — Manage + optional Claim Fees, side by side. */
	.lp-detail-actions {
		display: flex;
		flex-direction: row;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.lp-claim-fees-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		flex: 1;
		height: 48px;
		background: transparent;
		border: 2px solid var(--color-green-900);
		border-radius: var(--radius-lg);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.lp-claim-fees-btn :global(svg) {
		color: var(--color-green-900);
	}
	.lp-claim-fees-btn:hover:not(:disabled) {
		background-color: var(--color-success-bg-soft);
	}
	.lp-claim-fees-btn:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}
	.lp-claim-fees-btn-error {
		border-color: var(--color-danger);
	}
	.lp-claim-fees-btn-error :global(svg) {
		color: var(--color-danger);
	}
	.lp-claim-fees-btn-success {
		background-color: var(--color-success-bg-medium);
	}

	/* Letter-circle fallback for LP item logos when there is no
	 * symbol→asset-logo helper available. Mirrors `.token-logo` shape. */
	.lp-logo-fallback {
		background-color: var(--color-token-logo-fallback-bg);
	}
	.lp-logo-fallback .token-letter {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: var(--font-weight-bold);
		color: white;
	}

	/* ---------- Mobile ---------- */
	@media (max-width: 768px) {
		.portfolio {
			padding: var(--space-4) var(--space-3) var(--space-8);
		}
		.portfolio-grid {
			grid-template-columns: 1fr;
		}
		.kpi-inner {
			min-height: auto;
			padding: var(--space-5);
			gap: var(--space-5);
		}
		.claim-section {
			padding: var(--space-5);
			gap: var(--space-4);
		}
		:global(.claim-crystal) {
			/* Mobile uses the same full-width anchoring — asset has glow
			 * baked in, scales naturally. */
			top: 0;
			right: 0;
			width: 100%;
		}
		.section-head {
			padding: var(--space-4) var(--space-4) var(--space-3);
		}
		.section-body {
			padding: var(--space-5);
			min-height: 220px;
		}
		.section-body-split {
			grid-template-columns: 1fr;
		}
		.tt-head,
		.tt-row {
			grid-template-columns: minmax(80px, 1fr) minmax(60px, 1fr) minmax(80px, 1fr) minmax(56px, auto);
			grid-template-rows: auto auto;
			gap: 4px;
		}
		.tt-cell-24h,
		.tt-cell-price {
			display: none;
		}
		.stats-row {
			grid-template-columns: 1fr 1fr;
		}
		.lp-detail-actions {
			flex-direction: column;
		}
	}
</style>
