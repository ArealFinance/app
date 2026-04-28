<script lang="ts">
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import { Card } from '$lib/components/ui';
	import { ArrowUpSmall, Check } from '$lib/icons';
	import { wallet } from '$lib/stores/wallet.svelte';

	const isConnected = $derived(wallet.isConnected);

	type Tone = 'success' | 'danger';

	type OwnershipToken = {
		symbol: string;
		logoBg: string;
		logoSrc?: string;
		logoLetter?: string;
		qty: string;
		apy: string;
		apyTone: Tone;
		price24h: string;
		price24hTone: Tone;
		price: string;
		value: string;
	};

	type LpPosition = {
		id: string;
		pair: [string, string];
		apy: string;
		apyTone: Tone;
		selected?: boolean;
	};

	const tokens: OwnershipToken[] = [
		{
			symbol: 'USDt',
			logoBg: '#009393',
			logoSrc: '/images/tokens/usdt-t.svg',
			qty: '404.45',
			apy: '3.8%',
			apyTone: 'success',
			price24h: '10.5%',
			price24hTone: 'success',
			price: '$4.72',
			value: '$404.45'
		},
		{
			symbol: 'RWT',
			logoBg: '#A56EFF',
			logoSrc: '/images/tokens/rwt-mark.svg',
			qty: '829.55',
			apy: '2.31%',
			apyTone: 'success',
			price24h: '1.89%',
			price24hTone: 'danger',
			price: '$3.57',
			value: '$829.39'
		},
		{
			symbol: 'TRX',
			logoBg: '#FF060A',
			logoLetter: 'T',
			qty: '2,050.89',
			apy: '5.89%',
			apyTone: 'success',
			price24h: '27.7%',
			price24hTone: 'success',
			price: '$2.96',
			value: '$1,142.92'
		},
		{
			symbol: 'TON',
			logoBg: '#0098EA',
			logoLetter: 'T',
			qty: '768.27',
			apy: '12.5%',
			apyTone: 'success',
			price24h: '5.5%',
			price24hTone: 'success',
			price: '$1.08',
			value: '$200,249.98'
		}
	];

	const positions: LpPosition[] = [
		{ id: 'lp-1', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success', selected: true },
		{ id: 'lp-2', pair: ['USDt', 'RWT'], apy: '1.7% APY', apyTone: 'danger' },
		{ id: 'lp-3', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success' },
		{ id: 'lp-4', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success' },
		{ id: 'lp-5', pair: ['USDt', 'RWT'], apy: '3.8% APY', apyTone: 'success' }
	];

	let selectedLp = $state(positions[0]?.id);
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
					<!-- Filled. The horizontal 'cut' between top & bottom is achieved by
					     stacking two #080A0F sections inside the #181A29 outer card with
					     a small gap — NOT a real subtraction or clip-path. -->
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
									/>
									<span class="rewards-amount">46.096039</span>
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

							<button type="button" class="claim-btn">
								<Check size={16} />
								<span>Successful Claim</span>
							</button>
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

								<div class="dist-chart" aria-hidden="true">
									<div class="dist-bar dist-bar-purple"></div>
									<div class="dist-bar dist-bar-pink"></div>
									<span class="dist-marker"></span>
								</div>

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

						<!-- Decorative crystal — sits over both sections AND the gap. The PNG
						     itself has transparency around the crystal silhouette so the cut
						     between sections still reads through. -->
						<img
							class="claim-crystal"
							src="/images/hero/crystal.png"
							alt=""
							aria-hidden="true"
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
								{#if isConnected}
									<span class="count-badge count-badge-purple">{tokens.length}</span>
								{/if}
							</div>
							{#if isConnected}
								<span class="section-total">~ $3450.92</span>
							{/if}
						</header>
						<div class="section-body" class:section-body-table={isConnected}>
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
									</div>
									{#each tokens as t (t.symbol)}
										<div class="tt-row">
											<div class="tt-cell tt-cell-asset">
												<span class="token-logo" style:background-color={t.logoBg}>
													{#if t.logoSrc}
														<img src={t.logoSrc} alt="" aria-hidden="true" />
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
													<img src="/images/tokens/usdt-t.svg" alt="" aria-hidden="true" />
												</span>
												<span class="lp-logo lp-logo-overlap" style:background-color="#9E60F6">
													<img src="/images/tokens/rwt-mark.svg" alt="" aria-hidden="true" />
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

									<div class="lp-donut" aria-hidden="true">
										<svg viewBox="0 0 134 134" width="134" height="134">
											<defs>
												<linearGradient id="donut-purple" x1="0" y1="0" x2="0" y2="1">
													<stop offset="0" stop-color="#A56EFF" />
													<stop offset="1" stop-color="#602FDC" />
												</linearGradient>
											</defs>
											<!-- 47% USDt teal arc -->
											<circle
												cx="67"
												cy="67"
												r="56"
												fill="none"
												stroke="#009393"
												stroke-width="8"
												stroke-dasharray="165 351"
												stroke-dashoffset="0"
												transform="rotate(-90 67 67)"
											/>
											<!-- 53% RWT purple arc -->
											<circle
												cx="67"
												cy="67"
												r="56"
												fill="none"
												stroke="url(#donut-purple)"
												stroke-width="8"
												stroke-dasharray="186 351"
												stroke-dashoffset="-165"
												transform="rotate(-90 67 67)"
											/>
										</svg>
										<div class="lp-donut-center">
											<span class="lp-donut-label">Your Position</span>
											<span class="lp-donut-value">$211.71</span>
										</div>
									</div>

									<div class="lp-detail-rows">
										<div class="lp-detail-row">
											<span class="lp-detail-marker lp-marker-purple"></span>
											<span class="lp-detail-symbol">RWT</span>
											<span class="lp-detail-qty">10.00K</span>
											<span class="lp-detail-pill lp-pill-purple">53%</span>
										</div>
										<div class="lp-detail-sub">
											<span></span>
											<span></span>
											<span class="lp-detail-usd">$11.4k</span>
											<span></span>
										</div>
										<div class="lp-detail-row">
											<span class="lp-detail-marker lp-marker-teal"></span>
											<span class="lp-detail-symbol">USDt</span>
											<span class="lp-detail-qty">10.00K</span>
											<span class="lp-detail-pill lp-pill-teal">47%</span>
										</div>
										<div class="lp-detail-sub">
											<span></span>
											<span></span>
											<span class="lp-detail-usd">$11.4k</span>
											<span></span>
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
	</div>
</AppShell>

<style>
	.portfolio {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-6) 0 var(--space-12);
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
	 * Two #080A0F sections stacked inside the #181A29 outer card; the gap
	 * between them reveals the outer color and forms the horizontal 'cut'.
	 *
	 * The cut isn't a plain rectangular slot — its ends are rounded into
	 * stadium half-caps. Achieved by giving the FACING corners (top section's
	 * bottom + bottom section's top) a radius equal to half the gap height,
	 * so the two semicircular curves meet across the gap and read as a single
	 * pill-shaped channel. Outer corners keep the 20px radius the macet uses. */
	.claim-shell {
		position: relative;
		margin: 4px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.claim-section {
		background-color: var(--color-surface);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.claim-top {
		border-radius: var(--radius-lg) var(--radius-lg) 9px 9px;
	}
	.claim-bottom {
		border-radius: 9px 9px var(--radius-lg) var(--radius-lg);
	}
	.claim-section .rewards-block {
		flex: 1;
	}

	.claim-crystal {
		position: absolute;
		top: -16px;
		right: -24px;
		width: 280px;
		height: auto;
		pointer-events: none;
		transform: rotate(15deg);
		filter: drop-shadow(0 12px 40px rgba(168, 132, 255, 0.4));
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
		background-color: rgba(115, 255, 131, 0.15);
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
	.claim-btn:hover {
		background-color: rgba(115, 255, 131, 0.08);
	}
	.claim-btn :global(svg) {
		color: var(--color-green-900);
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

	/* Stacked bars chart */
	.dist-chart {
		position: relative;
		height: 200px;
		display: flex;
		flex-direction: column;
		gap: 0;
		padding-right: 6px;
	}
	.dist-bar {
		width: 13px;
		border-radius: 3px;
	}
	.dist-bar-purple {
		height: 88px;
		background-color: #a56eff;
	}
	.dist-bar-pink {
		height: 88px;
		background-color: #d844c6;
		margin-top: 4px;
	}
	.dist-marker {
		position: absolute;
		right: 0;
		top: 0;
		width: 2px;
		height: 100%;
		border-radius: 2px;
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
		padding: 12px;
		min-height: auto;
		align-items: stretch;
		justify-content: flex-start;
	}
	.section-body-split {
		padding: 12px;
		min-height: auto;
		align-items: stretch;
		justify-content: flex-start;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
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

	/* ---------- Token table ---------- */
	.tt {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.tt-head,
	.tt-row {
		display: grid;
		grid-template-columns: minmax(120px, 1.4fr) minmax(60px, 0.8fr) minmax(60px, 0.8fr) minmax(80px, 1fr) minmax(60px, 0.8fr) minmax(80px, 1fr);
		align-items: center;
		gap: var(--space-2);
		padding: 12px 16px;
	}
	.tt-head {
		padding: 8px 16px;
	}
	.tt-row {
		background-color: var(--color-surface-inset);
		border-radius: 14px;
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
	.token-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 9px;
		flex-shrink: 0;
		overflow: hidden;
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
		background-color: rgba(115, 255, 131, 0.15);
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
		padding-right: 4px;
	}
	.lp-item {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--space-3);
		padding: 14px 16px;
		background-color: var(--color-surface-inset);
		border: 1px solid transparent;
		border-radius: 16px;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: var(--color-text);
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.lp-item:hover {
		background-color: rgba(255, 255, 255, 0.04);
	}
	.lp-item-selected {
		border-color: #6e97ff;
		box-shadow: 0 0 8px rgba(110, 151, 255, 0.6);
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
		display: grid;
		grid-template-columns: 12px auto 1fr auto;
		row-gap: 4px;
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
	.lp-detail-symbol,
	.lp-detail-qty {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.lp-detail-qty {
		text-align: right;
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
	.lp-detail-sub {
		display: contents;
	}
	.lp-detail-usd {
		grid-column: 3;
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: var(--font-weight-semibold);
		text-align: right;
		color: var(--color-text-muted);
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
			top: -8px;
			right: -16px;
			width: 200px;
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
			grid-template-columns: minmax(80px, 1fr) minmax(60px, 1fr) minmax(80px, 1fr);
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
