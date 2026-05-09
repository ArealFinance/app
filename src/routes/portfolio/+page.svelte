<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Rooms } from '@areal/sdk/realtime';
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import AssetsDistributionChart from '$lib/components/charts/AssetsDistributionChart.svelte';
	import TickWheel from '$lib/components/charts/TickWheel.svelte';
	import { Card } from '$lib/components/ui';
	import { ArrowUpSmall, Check, Xmark } from '$lib/icons';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { auth } from '$lib/auth';
	import { network } from '$lib/network/network.svelte';
	import { realtimeClient } from '$lib/realtime/client.svelte';
	import { toast } from '$lib/components/ui';
	import { portfolio, RWT_DECIMALS } from '$lib/portfolio/store.svelte';
	import { formatTokenAmount } from '$lib/portfolio/format';
	import { claims, type ClaimAttempt } from '$lib/portfolio/claim.svelte';
	import { historyStore } from '$lib/portfolio/history.svelte';
	import { ClaimConfirmModal, HistorySection } from '$lib/components/portfolio';
	import type { PortfolioRow } from '@areal/sdk/portfolio';
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

	type LpPosition = {
		id: string;
		pair: [string, string];
		apy: string;
		apyTone: Tone;
		selected?: boolean;
	};

	// Phase 6: token list is sourced from on-chain holder portfolio. Price /
	// APY / value columns are placeholder dashes — Phase 7 will pipe in
	// pricing & APY signals.
	const tokens = $derived<OwnershipToken[]>(
		portfolio.rows.map((row) => ({
			symbol: row.metadata.symbol,
			logoLetter: row.metadata.symbol.slice(0, 1).toUpperCase(),
			qty: formatTokenAmount(row.balance, row.metadata.decimals, 2),
			apy: '—',
			apyTone: 'success' as const,
			price24h: '—',
			price24hTone: 'success' as const,
			price: '—',
			value: '—',
			row,
			canClaim: row.distributor !== null && (row.claimableNow ?? 0n) > 0n
		}))
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

	// TODO Phase 7 — LP positions come from native-dex/yield positions module.
	const positions: LpPosition[] = [
		{ id: 'lp-1', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success', selected: true },
		{ id: 'lp-2', pair: ['USDt', 'RWT'], apy: '1.7% APY', apyTone: 'danger' },
		{ id: 'lp-3', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success' },
		{ id: 'lp-4', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success' },
		{ id: 'lp-5', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success' }
	];

	let selectedLp = $state(positions[0]?.id);

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
	onMount(() => {
		portfolio.start();
		historyStore.start();
	});
	onDestroy(() => {
		portfolio.stop();
		historyStore.stop();
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
										{claimableUnknown ? '—' : unclaimedDisplay}
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
									<span>+0.00000026 RWT/sec</span>
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

						<!-- 18px gap-row recreating the Figma boolean Subtract.
						     Background is section colour (continuous with top + bottom
						     sections). Two pill-shaped overlays of outer-mat colour
						     punch the cut windows out: full pill (radius 9 = height/2)
						     means BOTH ends of each cut are rounded — outer end (toward
						     section's vertical edge) and inner end (toward connector).
						     Section material naturally wraps around all four pill ends
						     via the geometry, producing the four concave fillets seen
						     in the Figma source. The 74px space between the two cuts
						     is the visual 'connector' — no separate element needed. -->
						<div class="claim-gap-row" aria-hidden="true">
							<span class="claim-cut claim-cut-left"></span>
							<span class="claim-cut claim-cut-right"></span>
						</div>

						<!-- BOTTOM section: total value, chart, legend, stats -->
						<div class="claim-section claim-bottom">
							<div class="rewards-block">
								<div class="kpi-label">Total Value</div>
								<div class="kpi-value">$200,995.85</div>
							</div>

							<div class="dist-section">
								<div class="dist-header">
									<span class="dist-title">Assets distribution</span>
									<span class="dist-count">
										<span class="dist-count-dot" aria-hidden="true"></span>
										<span>5 categories</span>
									</span>
								</div>

								<AssetsDistributionChart />

								<div class="dist-legend">
									<div class="legend-row">
										<span class="legend-marker legend-purple"></span>
										<span class="legend-label">Ownership tokens</span>
										<span class="legend-value">$404.45</span>
										<span class="legend-pill legend-pill-purple">40.61%</span>
									</div>
									<div class="legend-row">
										<span class="legend-marker legend-pink"></span>
										<span class="legend-label">LP</span>
										<span class="legend-value">$379.69</span>
										<span class="legend-pill legend-pill-pink">21.26%</span>
									</div>
								</div>
							</div>

							<div class="stats-row">
								<div class="stat-cell">
									<span class="stat-label">Portfolio APY</span>
									<span class="stat-value stat-value-positive">1.55%</span>
								</div>
								<div class="stat-cell">
									<span class="stat-label">Daily Income</span>
									<span class="stat-value stat-value-positive">$0.02</span>
								</div>
								<div class="stat-cell">
									<span class="stat-label">24h change</span>
									<span class="stat-value stat-value-positive">
										<ArrowUpSmall size={14} variant="filled" />
										5.02%
									</span>
								</div>
							</div>
						</div>

						<!-- Decorative crystal with baked-in aurora glow — TOPMOST layer
						     per Figma (claim card z-order: bg → cut → blur → button →
						     text → chart → CRYSTAL). The asset is 936x943 with the
						     crystal silhouette in the upper portion and a soft purple
						     aurora taking the lower half — no extra drop-shadow needed.
						     Sits over the upper-right corner of the card. -->
						<img
							class="claim-crystal"
							src="/images/hero/crystal-glow.png"
							alt=""
							aria-hidden="true"
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
									<!-- TODO Phase 7 — section total comes from price feed. -->
									<span class="section-total">~ —</span>
								{/if}
							</div>
						</header>
						<div
							class="section-body"
							class:section-body-table={isConnected && portfolio.isReady && tokens.length > 0}
						>
							{#if !isConnected}
								<svg
									class="empty-illu"
									width="86"
									height="64"
									viewBox="0 0 86 64"
									fill="none"
									aria-hidden="true"
								>
									<rect x="0" y="0" width="86" height="22" rx="6" fill="#3C415F" opacity="0.7" />
									<rect x="0" y="26" width="86" height="22" rx="6" fill="#3C415F" opacity="0.45" />
									<rect x="0" y="52" width="64" height="12" rx="4" fill="#717390" opacity="0.3" />
									<circle cx="12" cy="11" r="4" fill="#73FF83" />
									<circle cx="12" cy="37" r="4" fill="#717390" opacity="0.6" />
								</svg>
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
								<svg
									class="empty-illu"
									width="86"
									height="64"
									viewBox="0 0 86 64"
									fill="none"
									aria-hidden="true"
								>
									<rect x="0" y="0" width="86" height="22" rx="6" fill="#3C415F" opacity="0.7" />
									<rect x="0" y="26" width="86" height="22" rx="6" fill="#3C415F" opacity="0.45" />
									<rect x="0" y="52" width="64" height="12" rx="4" fill="#717390" opacity="0.3" />
									<circle cx="12" cy="11" r="4" fill="#73FF83" />
									<circle cx="12" cy="37" r="4" fill="#717390" opacity="0.6" />
								</svg>
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
								{#if isConnected}
									<span class="count-badge count-badge-purple">22</span>
								{/if}
							</div>
							{#if isConnected}
								<span class="section-total">~ $211.71</span>
							{/if}
						</header>

						<div class="section-body" class:section-body-split={isConnected}>
							{#if !isConnected}
								<svg
									class="empty-illu"
									width="100"
									height="76"
									viewBox="0 0 100 76"
									fill="none"
									aria-hidden="true"
								>
									<defs>
										<linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
											<stop offset="0" stop-color="#3C415F" />
											<stop offset="1" stop-color="#111322" />
										</linearGradient>
									</defs>
									<line x1="0" y1="64" x2="100" y2="64" stroke="#2A2E37" stroke-width="1" />
									<rect x="2" y="36" width="14" height="28" rx="3" fill="url(#bar-grad)" />
									<rect x="22" y="20" width="14" height="44" rx="3" fill="url(#bar-grad)" />
									<rect x="42" y="6" width="14" height="58" rx="3" fill="#73FF83" opacity="0.85" />
									<rect x="62" y="28" width="14" height="36" rx="3" fill="url(#bar-grad)" />
									<rect x="82" y="44" width="14" height="20" rx="3" fill="url(#bar-grad)" />
									<polyline
										points="9,30 29,18 49,4 69,26 89,42"
										stroke="#73FF83"
										stroke-width="1.5"
										fill="none"
										stroke-linecap="round"
										stroke-linejoin="round"
										opacity="0.6"
									/>
								</svg>
								<p class="empty-title">You do not currently hold any tokens</p>
								<p class="empty-sub">Start adding tokens</p>
							{:else}
								<!-- LEFT pane: positions list -->
								<div class="lp-list">
									{#each positions as p (p.id)}
										<button
											type="button"
											class="lp-item"
											class:lp-item-selected={selectedLp === p.id}
											onclick={() => (selectedLp = p.id)}
										>
											<span class="lp-logos">
												<span class="lp-logo" style:background-color="#009393">
													<img src="/images/tokens/usdt-t.svg" alt="" aria-hidden="true" loading="lazy" />
												</span>
												<span class="lp-logo lp-logo-overlap" style:background-color="#9E60F6">
													<img src="/images/tokens/rwt-mark.svg" alt="" aria-hidden="true" loading="lazy" />
												</span>
											</span>
											<span class="lp-pair">{p.pair[0]} / {p.pair[1]}</span>
											<span class="apy-pill apy-pill-{p.apyTone} lp-apy">
												{#if p.apyTone === 'success'}
													<span class="caret-icon"><ArrowUpSmall size={12} variant="filled" /></span>
												{:else}
													<span class="caret-icon caret-down"><ArrowUpSmall size={12} variant="filled" /></span>
												{/if}
												{p.apy}
											</span>
										</button>
									{/each}
									<div class="lp-fade" aria-hidden="true"></div>
								</div>

								<!-- RIGHT pane: detail -->
								<div class="lp-detail">
									<header class="lp-detail-head">
										<h3>USDt / RWT</h3>
									</header>
									<hr class="lp-detail-divider" aria-hidden="true" />

									<div class="lp-donut" aria-hidden="true">
										<!-- 53% RWT (purple) starts at 12 o'clock going CW; the
										     remaining 47% USDt (teal) wraps the left half. -->
										<TickWheel
											value={0.53}
											colorA="#A56EFF"
											colorB="#1FB7B7"
											size={130}
											tickCount={50}
											tickLength={10}
											tickWidth={3}
										/>
										<div class="lp-donut-center">
											<span class="lp-donut-label">Your Position</span>
											<span class="lp-donut-value">$211.71</span>
										</div>
									</div>

									<hr class="lp-detail-divider" aria-hidden="true" />

									<div class="lp-detail-rows">
										<div class="lp-detail-row">
											<span class="lp-detail-marker lp-marker-purple"></span>
											<span class="lp-detail-symbol">RWT</span>
											<span class="lp-detail-amount">
												<span class="lp-detail-qty">10.00K</span>
												<span class="lp-detail-usd">$11.4k</span>
											</span>
											<span class="lp-detail-pill lp-pill-purple">53%</span>
										</div>
										<div class="lp-detail-row">
											<span class="lp-detail-marker lp-marker-teal"></span>
											<span class="lp-detail-symbol">USDt</span>
											<span class="lp-detail-amount">
												<span class="lp-detail-qty">10.00K</span>
												<span class="lp-detail-usd">$11.4k</span>
											</span>
											<span class="lp-detail-pill lp-pill-teal">47%</span>
										</div>
									</div>

									<button type="button" class="lp-manage-btn">Manage</button>
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
	 * Re-creates the Figma Subtract: full inner #080A0F minus two 199x18
	 * strips, leaving a 74px connector bar in the centre. Built with:
	 *   - claim-top      → top section, flat bottom edge
	 *   - claim-gap-row  → 18px height, no bg (outer #181A29 shows through)
	 *   - claim-connector→ 74px bar absolute-pinned to centre of gap, #080A0F
	 *   - claim-bottom   → bottom section, flat top edge
	 * Result: two visible windows of outer colour on either side of the bar,
	 * exactly matching the boolean op in the source file. */
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
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		/* Extend section bg 12px past content (padding 24 → 36), then pull
		 * the next sibling 18px back up (negative margin). Net: section bg
		 * covers the full gap-row band from above, while flow stays compact.
		 * Combined with claim-bottom's mirror trick the gap-row is fully
		 * blanketed by section material — cut overlays carve outer mat
		 * cleanly, no separate background needed on gap-row. */
		padding-bottom: 36px;
		margin-bottom: -18px;
	}
	.claim-bottom {
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		padding-top: 36px;
		margin-top: -18px;
	}
	.claim-section .rewards-block {
		flex: 1;
	}

	.claim-gap-row {
		position: relative;
		height: 18px;
		/* No background — top + bottom sections (with padding/margin tricks)
		 * cover the gap-row band with section bg from both sides. z-index
		 * keeps the cut overlays above section bg. */
		z-index: 9;
	}
	.claim-cut {
		position: absolute;
		top: 0;
		height: 18px;
		/* Outer mat colour (the Card variant="inset" surface) shows through
		 * each cut. Each cut is rounded ONLY on the centre-facing end (toward
		 * the connector); the outer end stays flush with the section's outer
		 * vertical edge. radius=9px = height/2 → full semicircle on the
		 * inner end. Concave fillets in the section material show only at
		 * the inner cut ends (around the connector). */
		background-color: var(--color-surface-inset);
	}
	.claim-cut-left {
		left: 0;
		/* 37px = half of 74px connector core. Together both cuts leave a
		 * 74px section-coloured strip in the centre — the visible connector. */
		right: calc(50% + 37px);
		border-radius: 0 9px 9px 0;
	}
	.claim-cut-right {
		left: calc(50% + 37px);
		right: 0;
		border-radius: 9px 0 0 9px;
	}

	/* Crystal — fills claim-shell full width with baked-in aurora glow.
	 * Asset is 936x943: crystal silhouette in upper portion + soft glow
	 * filling the rest. Anchored top-right at 0,0 so the silhouette lines
	 * up with the upper-right of the card and the glow bleeds down across
	 * the cut into the upper part of the bottom section. No CSS drop-shadow
	 * — the asset carries it. Last DOM child of .claim-shell → paints on
	 * top of every section and the cut overlays. */
	.claim-crystal {
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
	.lp-logo img {
		width: 60%;
		height: 60%;
		object-fit: contain;
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
		margin-top: var(--space-2);
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
		.claim-crystal {
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
	}
</style>
