<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import PriceChart from '$lib/components/charts/PriceChart.svelte';
	import TickWheel from '$lib/components/charts/TickWheel.svelte';
	import VaultBubbleChart from '$lib/components/charts/VaultBubbleChart.svelte';
	import QuickSwap from '$lib/components/sections/QuickSwap.svelte';
	import type { SwapToken } from '$lib/components/sections/QuickSwap.svelte';
	import PoolDetailPanel from '$lib/components/sections/PoolDetailPanel.svelte';
	import type { PoolInfo } from '$lib/components/sections/PoolDetailPanel.svelte';
	import { Modal } from '$lib/components/ui';
	import { ArrowUpSmall, AngleRightSmall, FileText } from '$lib/icons';

	const symbol = $derived((page.params.symbol ?? 'sprk').toLowerCase());
	const isVaultToken = $derived(symbol === 'rwt');

	type TokenInfo = {
		id: string;
		symbol: string;
		name: string;
		logoBg: string;
		logoSrc?: string;
		category: string;
		price: string;
		priceChange: string;
		priceChangeTone: 'success' | 'danger';
		about: string;
		stats: {
			price: string;
			change24h: string;
			tvl: string;
			bookNav: string;
			navPerToken: string;
			marketCap: string;
			totalSupply: string;
			holders: string;
		};
	};

	const TOKEN_BY_SYMBOL: Record<string, TokenInfo> = {
		sprk: {
			id: 'sprk',
			symbol: 'SPRK',
			name: 'Sparkles',
			logoBg: '#4265FF',
			logoSrc: '/images/tokens/sparkles.svg',
			category: 'OWNERSHIP',
			price: '$0.9984',
			priceChange: '0.57%',
			priceChangeTone: 'success',
			about:
				'Sparkles (SPRK) is an ownership token tied to the Areal protocol revenue. Holders share in protocol fees and gain governance over treasury allocation across real-world and DeFi strategies.',
			stats: {
				price: '$0.9984',
				change24h: '0.57%',
				tvl: '$41.2K',
				bookNav: '$0.3980',
				navPerToken: '$41.2K',
				marketCap: '$204.7K',
				totalSupply: '$205.00K',
				holders: '5,00'
			}
		},
		rwt: {
			id: 'rwt',
			symbol: 'RWT',
			name: 'Real World Token',
			logoBg: '#A56EFF',
			logoSrc: '/images/tokens/rwt-mark.svg',
			category: 'OWNERSHIP',
			price: '$0.9984',
			priceChange: '0.57%',
			priceChangeTone: 'success',
			about:
				'RWT (Real World Token) is the core protocol token of Areal. It is backed by a diversified treasury of real-world assets and DeFi strategies, providing holders with sustainable yield from protocol revenue.',
			stats: {
				price: '$0.9984',
				change24h: '0.57%',
				tvl: '$41.2K',
				bookNav: '$0.3980',
				navPerToken: '$41.2K',
				marketCap: '$204.7K',
				totalSupply: '$205.00K',
				holders: '5,00'
			}
		}
	};

	const token = $derived<TokenInfo>(TOKEN_BY_SYMBOL[symbol] ?? TOKEN_BY_SYMBOL.sprk);

	// SwapToken adapter for QuickSwap — uses the page's token as the pinned
	// side. Reactive: rebuilds when the URL [symbol] changes.
	const pinnedToken = $derived<SwapToken>({
		id: token.id,
		symbol: token.symbol,
		bg: token.logoBg,
		iconSrc: token.logoSrc,
		iconLetter: token.symbol[0]
	});

	const periods = ['24H', '7D', '1M', '3M', '6M', '1Y', 'ALL'] as const;
	let activePeriod = $state<(typeof periods)[number]>('7D');

	// Span (in days) of the active period — drives the X-axis label series.
	const PERIOD_DAYS: Record<(typeof periods)[number], number> = {
		'24H': 1,
		'7D': 7,
		'1M': 30,
		'3M': 90,
		'6M': 180,
		'1Y': 365,
		ALL: 720
	};

	// 9 evenly-spaced labels backwards from "today", formatted as DD.MM.
	// (Mock data — once we plug a real time-series this can read its tick
	// vector instead.)
	const chartXLabels = $derived<string[]>(buildXLabels(activePeriod));
	function buildXLabels(period: (typeof periods)[number]): string[] {
		const days = PERIOD_DAYS[period];
		const now = new Date();
		const labels: string[] = [];
		const TICK_COUNT = 9;
		for (let i = 0; i < TICK_COUNT; i += 1) {
			const fraction = i / (TICK_COUNT - 1); // 0..1
			const offsetDays = (1 - fraction) * days;
			const d = new Date(now);
			d.setDate(now.getDate() - offsetDays);
			const dd = String(d.getDate()).padStart(2, '0');
			const mm = String(d.getMonth() + 1).padStart(2, '0');
			labels.push(`${dd}.${mm}`);
		}
		return labels;
	}

	type DetailTab = 'RWA’s' | 'Liquidity' | 'Data' | 'Governance' | 'RWT Vault';
	const detailTabs = $derived<DetailTab[]>(
		isVaultToken ? ['Liquidity', 'RWT Vault'] : ['RWA’s', 'Liquidity', 'Data', 'Governance']
	);
	let activeDetailTab = $state<DetailTab>('RWA’s');
	$effect(() => {
		// Re-align the active tab when the token changes (vault tokens don't
		// have an RWA's tab and vice versa).
		if (!detailTabs.includes(activeDetailTab)) {
			activeDetailTab = isVaultToken ? 'RWT Vault' : 'RWA’s';
		}
	});

	type VaultPosition = {
		id: string;
		symbol: string;
		tokens: string;
		usd: string;
		yieldPct: string;
		color: string; // bubble + dot colour
		bubbleSize: number; // visual radius weight
	};
	type LiquidityPool = {
		id: string;
		pairA: { symbol: string; bg: string; iconSrc?: string; iconLetter?: string };
		pairB: { symbol: string; bg: string; iconSrc?: string; iconLetter?: string };
		tvl: string;
		kind: 'Concentrated' | 'Standard';
	};

	const POOLS_BY_SYMBOL: Record<string, LiquidityPool[]> = {
		rwt: [
			{
				id: 'rwt-usdc',
				pairA: { symbol: 'RWT', bg: '#A56EFF', iconSrc: '/images/tokens/rwt-mark.svg' },
				pairB: { symbol: 'USDC', bg: '#2775CA', iconLetter: 'C' },
				tvl: '$20.15k',
				kind: 'Concentrated'
			}
		],
		sprk: [
			{
				id: 'sprk-usdc',
				pairA: { symbol: 'SPRK', bg: '#4265FF', iconSrc: '/images/tokens/sparkles.svg' },
				pairB: { symbol: 'USDC', bg: '#2775CA', iconLetter: 'C' },
				tvl: '$8.42k',
				kind: 'Standard'
			}
		]
	};

	const liquidityPools = $derived<LiquidityPool[]>(POOLS_BY_SYMBOL[symbol] ?? []);

	const POOL_DETAILS: Record<string, PoolInfo> = {
		'rwt-usdc': {
			id: 'rwt-usdc',
			pairA: { symbol: 'RWT', bg: '#A56EFF', iconSrc: '/images/tokens/rwt-mark.svg' },
			pairB: { symbol: 'USDC', bg: '#2775CA', iconLetter: 'C' },
			tvlPill: '$20.15k',
			kind: 'Concentrated',
			totalUsd: '$21,893.59',
			allocation: { aPct: 49.3, bPct: 50.7 },
			tokenA: { qty: '10.00K', usd: '$11.4k', pct: '53%' },
			tokenB: { qty: '10.00K', usd: '$10.1k', pct: '47%' },
			currentPrice: '1 RWT = 0.88535 USDC',
			priceRange: '0.8404 — 0.9287',
			volume24h: '$0.0000',
			feeTier: '0.5%',
			fees24h: '$0.0000',
			binStep: '20 bps (0.2%)',
			priceLabels: ['0.840', '0.863', '0.885', '0.825', '0.972', '0.982', '0.993', '0.997'],
			userBalance: '950'
		},
		'sprk-usdc': {
			id: 'sprk-usdc',
			pairA: { symbol: 'SPRK', bg: '#4265FF', iconSrc: '/images/tokens/sparkles.svg' },
			pairB: { symbol: 'USDC', bg: '#2775CA', iconLetter: 'C' },
			tvlPill: '$8.42k',
			kind: 'Standard',
			totalUsd: '$8,418.20',
			allocation: { aPct: 50, bPct: 50 },
			tokenA: { qty: '4.21K', usd: '$4.21k', pct: '50%' },
			tokenB: { qty: '4.21K', usd: '$4.21k', pct: '50%' },
			currentPrice: '1 SPRK = 0.9984 USDC',
			priceRange: '—',
			volume24h: '$320.45',
			feeTier: '0.3%',
			fees24h: '$0.96',
			binStep: '—',
			priceLabels: [],
			userBalance: '950'
		}
	};

	let openPoolId = $state<string | null>(null);
	const openedPool = $derived<PoolInfo | null>(
		openPoolId ? (POOL_DETAILS[openPoolId] ?? null) : null
	);
	function openPool(id: string) {
		openPoolId = id;
	}
	function closePool() {
		openPoolId = null;
	}

	const vaultPositions: VaultPosition[] = [
		{ id: 'sand', symbol: 'SAND', tokens: '82 000,00 tokens', usd: '$565.9k', yieldPct: '3620%', color: '#7D2BF4', bubbleSize: 205 },
		{ id: 'usdc', symbol: 'USDC', tokens: '90 000,00 tokens', usd: '$101.4k', yieldPct: '1590%', color: '#447AD8', bubbleSize: 169 },
		{ id: 'sol', symbol: 'SOL', tokens: '50 000,00 tokens', usd: '$90k', yieldPct: '1590%', color: '#44D8BA', bubbleSize: 97 },
		{ id: 'dot', symbol: 'DOT', tokens: '50 000,00 tokens', usd: '$85.5k', yieldPct: '1590%', color: '#D844C6', bubbleSize: 90 },
		{ id: 'btc', symbol: 'BTC', tokens: '50 000,00 tokens', usd: '$12.5k', yieldPct: '1590%', color: '#D89D44', bubbleSize: 80 }
	];

	type RwaBreakdownRow = { label: string; qty: string; usd: string; pct: string; pctTone: 'purple' | 'teal' | 'pink' };
	const rwaBreakdown: RwaBreakdownRow[] = [
		{ label: 'NFT 1', qty: '10.00K', usd: '$11.4k', pct: '53%', pctTone: 'purple' },
		{ label: 'NFT 2', qty: '10.00K', usd: '$11.4k', pct: '40%', pctTone: 'teal' },
		{ label: 'NFT 2', qty: '10.00K', usd: '$11.4k', pct: '7%', pctTone: 'pink' }
	];

	type DataReport = {
		id: string;
		title: string;
		href: string;
		pinned?: boolean;
	};
	const dataReports: DataReport[] = [
		{ id: 'r-202604', title: 'Monthly Report 04.2026.pdf', href: '#', pinned: true },
		{ id: 'r-202603', title: 'Monthly Report 03.2026.pdf', href: '#' },
		{ id: 'r-202602', title: 'Monthly Report 02.2026.pdf', href: '#' }
	];

	type NftCard = {
		id: string;
		title: string;
		category: 'Active' | 'Unactive';
		year: string;
		price: string;
		date: string;
		image?: string;
	};
	const nftCards: NftCard[] = [
		{
			id: 'mini-1',
			title: 'Mini Cooper',
			category: 'Active',
			year: '2023',
			price: '23,500 USD',
			date: '14.04.2026',
			image: '/images/rwa/mini-cooper.png'
		},
		{
			id: 'mini-2',
			title: 'Mini Cooper',
			category: 'Unactive',
			year: '2023',
			price: '23,500 USD',
			date: '14.04.2026',
			image: '/images/rwa/mini-cooper-bw.png'
		}
	];
</script>

<svelte:head>
	<title>{token.name} ({token.symbol}) · Areal</title>
</svelte:head>

<AppShell currentPath="/markets">
	<div class="token-page">
		<div class="token-grid">
			<!-- ========== LEFT COLUMN: header + stats grid ========== -->
			<aside class="token-aside">
				<header class="token-head">
					<div class="token-id">
						<div class="token-logo" style:background-color={token.logoBg}>
							{#if token.logoSrc}
								<img src={token.logoSrc} alt="" aria-hidden="true" />
							{:else}
								<span class="token-logo-letter">{token.symbol[0]}</span>
							{/if}
						</div>
						<div class="token-name-block">
							<div class="token-title">
								<span class="token-name">{token.name}</span>
								<span class="token-sym">{token.symbol}</span>
							</div>
							<span class="token-cat">{token.category}</span>
						</div>
					</div>

					<div class="token-price-block">
						<span class="token-price">{token.price}</span>
						<span class="apy-pill apy-pill-{token.priceChangeTone} token-price-pill">
							<span class="caret-icon" class:caret-down={token.priceChangeTone === 'danger'}>
								<ArrowUpSmall size={12} variant="filled" />
							</span>
							{token.priceChange}
						</span>
					</div>
				</header>

				<hr class="token-divider" aria-hidden="true" />

				<section class="stats-grid">
				<div class="stat-cell">
					<span class="stat-label">Price</span>
					<span class="stat-value">{token.stats.price}</span>
				</div>
				<div class="stat-cell">
					<span class="stat-label">24H change</span>
					<span class="stat-value stat-value-success">
						<span class="caret-icon"><ArrowUpSmall size={14} variant="filled" /></span>
						{token.stats.change24h}
					</span>
				</div>
				<div class="stat-cell">
					<span class="stat-label">TVL</span>
					<span class="stat-value">{token.stats.tvl}</span>
				</div>
				<div class="stat-cell">
					<span class="stat-label">Book NAV</span>
					<span class="stat-value">{token.stats.bookNav}</span>
				</div>
				<div class="stat-cell">
					<span class="stat-label">NAV / token</span>
					<span class="stat-value">{token.stats.navPerToken}</span>
				</div>
				<div class="stat-cell">
					<span class="stat-label">Market cap</span>
					<span class="stat-value">{token.stats.marketCap}</span>
				</div>
				<div class="stat-cell">
					<span class="stat-label">Total supply</span>
					<span class="stat-value">{token.stats.totalSupply}</span>
				</div>
				<div class="stat-cell">
					<span class="stat-label">Holders</span>
					<span class="stat-value">{token.stats.holders}</span>
				</div>
			</section>
			</aside>

			<!-- ========== CENTER COLUMN: chart + about + tabs + RWA + NFT ========== -->
			<div class="token-center">
				<section class="chart-card">
				<div class="chart-tabs" role="tablist">
					{#each periods as p}
						<button
							type="button"
							class="chart-tab"
							class:chart-tab-active={activePeriod === p}
							role="tab"
							aria-selected={activePeriod === p}
							onclick={() => (activePeriod = p)}
						>
							{p}
						</button>
					{/each}
				</div>

				<div class="chart-area">
					<PriceChart currentPrice={token.price.replace(/^\$/, '')} xLabels={chartXLabels} />
				</div>
			</section>

			<!-- About — text block right under the chart card -->
			<section class="about">
				<h3 class="about-title">About {token.symbol}</h3>
				<p class="about-text">{token.about}</p>
			</section>

			<!-- DETAIL TABS + RWA breakdown — center column -->
			<section class="detail-section">
				<div class="detail-tabs" role="tablist" aria-label="Token details">
					{#each detailTabs as t}
						<button
							type="button"
							class="detail-tab"
							class:detail-tab-active={activeDetailTab === t}
							role="tab"
							aria-selected={activeDetailTab === t}
							onclick={() => (activeDetailTab = t)}
						>
							{t}
						</button>
					{/each}
				</div>

				{#if activeDetailTab === 'RWA’s'}
					<div class="detail-card">
						<div class="detail-donut" aria-hidden="true">
							<TickWheel
								value={0.53}
								colorA="#A56EFF"
								colorB="#1FB7B7"
								size={134}
								tickCount={50}
								tickLength={10}
								tickWidth={3}
							/>
							<div class="detail-donut-center">
								<span class="detail-donut-label">Portfolio</span>
								<span class="detail-donut-value">$9598</span>
							</div>
						</div>

						<div class="detail-rows">
							{#each rwaBreakdown as row}
								<div class="detail-row">
									<span class="detail-marker detail-marker-{row.pctTone}"></span>
									<span class="detail-symbol">{row.label}</span>
									<span class="detail-amount">
										<span class="detail-qty">{row.qty}</span>
										<span class="detail-usd">{row.usd}</span>
									</span>
									<span class="detail-pill detail-pill-{row.pctTone}">{row.pct}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- NFT cards belong to the RWA's tab — show only here. -->
					<div class="nft-grid">
						{#each nftCards as nft (nft.id)}
							<article class="nft-card">
								<div class="nft-cover" aria-hidden="true">
									{#if nft.image}
										<img src={nft.image} alt="" />
									{/if}
								</div>
								<div class="nft-body">
									<header class="nft-head">
										<h3 class="nft-title">
											{nft.title}
											<span class="nft-desc-icon" aria-hidden="true">≡</span>
										</h3>
										<span class="nft-status nft-status-{nft.category === 'Active' ? 'on' : 'off'}">
											{#if nft.category === 'Active'}
												<span class="nft-status-dot" aria-hidden="true"></span>
											{/if}
											{nft.category}
										</span>
									</header>
									<div class="nft-stats">
										<div class="nft-stat">
											<span class="nft-stat-label">Year of production</span>
											<span class="nft-stat-value">{nft.year}</span>
										</div>
										<div class="nft-stat">
											<span class="nft-stat-label">Price</span>
											<span class="nft-stat-value">{nft.price}</span>
										</div>
										<div class="nft-stat">
											<span class="nft-stat-label">Date of purchase</span>
											<span class="nft-stat-value">{nft.date}</span>
										</div>
									</div>
								</div>
							</article>
						{/each}
					</div>
				{:else if activeDetailTab === 'Liquidity'}
					<ul class="pool-list">
						{#each liquidityPools as p (p.id)}
							<li>
								<button type="button" class="pool-row" onclick={() => openPool(p.id)}>
									<span class="pool-logos">
										<span class="pool-logo" style:background-color={p.pairA.iconSrc ? 'transparent' : p.pairA.bg}>
											{#if p.pairA.iconSrc}
												<img src={p.pairA.iconSrc} alt="" aria-hidden="true" />
											{:else}
												<span>{p.pairA.iconLetter ?? p.pairA.symbol[0]}</span>
											{/if}
										</span>
										<span class="pool-logo pool-logo-overlap" style:background-color={p.pairB.iconSrc ? 'transparent' : p.pairB.bg}>
											{#if p.pairB.iconSrc}
												<img src={p.pairB.iconSrc} alt="" aria-hidden="true" />
											{:else}
												<span>{p.pairB.iconLetter ?? p.pairB.symbol[0]}</span>
											{/if}
										</span>
									</span>
									<span class="pool-symbol">{p.pairA.symbol}</span>
									<span class="pool-symbol">{p.pairB.symbol}</span>
									<span class="pool-spacer"></span>
									<span class="pool-tvl">{p.tvl}</span>
									<span class="pool-kind pool-kind-{p.kind.toLowerCase()}">{p.kind}</span>
									<span class="pool-arrow" aria-hidden="true">
										<AngleRightSmall size={20} />
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{:else if activeDetailTab === 'RWT Vault'}
					<!-- NAV Growth area chart on dark substrate -->
					<div class="vault-nav-card">
						<h4 class="vault-nav-title">NAV Growth</h4>
						<div class="vault-nav-chart">
							<PriceChart />
						</div>
					</div>

					<!-- Vault positions: bubble chart + breakdown list -->
					<header class="vault-head">
						<h3 class="vault-title">Vault Positions</h3>
						<span class="vault-total">~ $879.5k</span>
					</header>

					<VaultBubbleChart bubbles={vaultPositions} height={360} />

					<ul class="vault-list">
						{#each vaultPositions as p (p.id)}
							<li class="vault-row">
								<span class="vault-row-dot" style:background-color={p.color}></span>
								<span class="vault-row-symbol">{p.symbol}</span>
								<span class="vault-row-tokens">{p.tokens}</span>
								<span class="vault-row-usd">{p.usd}</span>
								<span class="vault-row-yield">{p.yieldPct}</span>
							</li>
						{/each}
					</ul>
				{:else if activeDetailTab === 'Data'}
					<ul class="data-list">
						{#each dataReports as r (r.id)}
							<li>
								<a class="data-row" class:data-row-pinned={r.pinned} href={r.href}>
									<span class="data-row-icon" aria-hidden="true">
										<FileText size={18} />
									</span>
									<span class="data-row-title">
										{r.title}
										{#if r.pinned}
											<svg class="data-row-pin" viewBox="0 0 14 14" aria-hidden="true">
												<!-- Simple thumbtack glyph in #A984F3 -->
												<path
													d="M9.5 1L13 4.5l-2.4 1L8.4 7.7l1.2 3.4L8.4 12 5.6 8.4 2 11.6 1 10.5l3.2-3.6L1 4.6l1.6-1.4 3.4 1.2L8.2 2 9.5 1z"
													fill="#A984F3"
												/>
											</svg>
										{/if}
									</span>
									<span class="data-row-arrow" aria-hidden="true">
										<AngleRightSmall size={20} />
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="detail-empty">Coming soon.</div>
				{/if}
			</section>
			</div>

			<!-- ========== RIGHT COLUMN: quick swap (current token pinned to From) ========== -->
			<QuickSwap {pinnedToken} pinnedSide="from" />
		</div>
	</div>

	<Modal open={openedPool !== null} onclose={closePool} aria-labelledby="pool-modal-title">
		{#if openedPool}
			<PoolDetailPanel pool={openedPool} onclose={closePool} />
		{/if}
	</Modal>
</AppShell>

<style>
	.token-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-6);
		max-width: 1340px;
		margin: 0 auto;
		width: 100%;
	}

	/* ---------- Left column: header + divider + stats ---------- */
	.token-aside {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.token-divider {
		margin: 0;
		border: 0;
		height: 1px;
		background-color: rgba(255, 255, 255, 0.08);
	}
	.token-center {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}

	/* ---------- About text ---------- */
	.about {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 0 8px;
	}
	.about-title {
		margin: 0;
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.about-text {
		margin: 0;
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
		line-height: 140%;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}

	/* ---------- Header ---------- */
	.token-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.token-id {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.token-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: 20px;
		font-family: var(--font-body);
		font-weight: var(--font-weight-bold);
		font-size: 22px;
		color: #fff;
		overflow: hidden;
	}
	.token-logo img {
		width: 60%;
		height: 60%;
		object-fit: contain;
	}
	.token-name-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.token-title {
		display: inline-flex;
		align-items: baseline;
		gap: 8px;
	}
	.token-name {
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.token-sym {
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 500;
		letter-spacing: -0.6px;
		color: rgba(251, 242, 255, 0.5);
	}
	.token-cat {
		display: inline-flex;
		align-items: center;
		padding: 2px 12px;
		border-radius: 8px;
		background-color: rgba(83, 67, 121, 0.5);
		color: #a984f3;
		font-family: 'Geist Mono', var(--font-body);
		font-size: 14px;
		font-weight: 600;
		text-transform: uppercase;
		align-self: flex-start;
	}
	.token-price-block {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
	}
	.token-price {
		font-family: 'Onest', var(--font-body);
		font-size: 36px;
		font-weight: 500;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.token-price-pill {
		font-family: 'Geist Mono', var(--font-body);
	}

	/* ---------- Layout grid ---------- */
	.token-grid {
		display: grid;
		grid-template-columns: 272px 1fr 324px;
		gap: var(--space-4);
		align-items: start;
	}

	/* ---------- Stats grid (left) ---------- */
	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px 32px;
	}
	.stat-cell {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.stat-label {
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.stat-value {
		font-family: var(--font-body);
		font-size: 18px;
		font-weight: 500;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.stat-value-success {
		color: #75e38c;
	}
	.stat-value-danger {
		color: #ff0088;
	}

	/* ---------- Chart card (centre) ---------- */
	.chart-card {
		position: relative;
		min-height: 455px;
		background-color: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.chart-tabs {
		display: inline-flex;
		gap: 24px;
		padding: 4px 0;
	}
	.chart-tab {
		position: relative;
		background: transparent;
		border: 0;
		padding: 4px 2px;
		cursor: pointer;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.2px;
		color: var(--color-text-muted);
		transition: color var(--motion-base) var(--ease-out);
	}
	.chart-tab:hover {
		color: var(--color-text);
	}
	.chart-tab-active {
		color: var(--color-text);
	}
	.chart-tab-active::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -4px;
		height: 2px;
		background-color: var(--color-text);
		border-radius: 2px;
	}
	.chart-area {
		display: flex;
		flex-direction: column;
		/* Definite height keeps LayerCake from reading 0 on first paint;
		 * flex:1 alone collapses inside a min-height-only parent. */
		height: 320px;
	}

	/* Quick Swap is now a self-contained component
	 * (lib/components/sections/QuickSwap.svelte) — its styles live there. */

	/* ---------- Reusable apy-pill (mirror Portfolio) ---------- */
	.apy-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 10px;
		border-radius: 8px;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.6px;
	}
	.apy-pill-success {
		background-color: rgba(117, 227, 140, 0.25);
		color: #75e38c;
	}
	.apy-pill-danger {
		background-color: rgba(255, 0, 136, 0.15);
		color: #ff0088;
	}
	.caret-icon {
		display: inline-flex;
	}
	.caret-icon.caret-down {
		transform: rotate(180deg);
	}

	/* ---------- Detail tabs + RWA breakdown ---------- */
	.detail-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.detail-tabs {
		display: inline-flex;
		gap: 32px;
		padding-bottom: 8px;
	}
	.detail-tab {
		position: relative;
		background: transparent;
		border: 0;
		padding: 4px 2px;
		cursor: pointer;
		font-family: var(--font-sans);
		font-size: 20px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
		transition: color var(--motion-base) var(--ease-out);
	}
	.detail-tab:hover {
		color: var(--color-text);
	}
	.detail-tab-active {
		color: var(--color-text);
	}
	.detail-tab-active::after {
		content: '';
		position: absolute;
		left: 0;
		width: 32px;
		bottom: -8px;
		height: 3px;
		background-color: var(--color-text);
		border-radius: 128px;
	}

	.detail-card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 32px;
		align-items: center;
		padding: 4px;
		background-color: var(--color-surface-inset);
		border-radius: 32px;
	}
	.detail-card > * {
		min-width: 0;
	}
	.detail-donut {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 220px;
		height: 174px;
		padding: 20px;
		background-color: var(--color-surface);
		border-radius: 28px;
	}
	.detail-donut-center {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		text-align: center;
	}
	.detail-donut-label {
		font-family: var(--font-body);
		font-size: 13px;
		font-weight: 500;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
	.detail-donut-value {
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.detail-rows {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 24px;
	}
	.detail-row {
		display: grid;
		grid-template-columns: 12px auto 1fr auto;
		column-gap: var(--space-3);
		align-items: center;
	}
	.detail-marker {
		width: 10px;
		height: 10px;
		border-radius: 4px;
	}
	.detail-marker-purple {
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.detail-marker-teal {
		background-color: #009393;
	}
	.detail-marker-pink {
		background-color: #ff0088;
	}
	.detail-symbol {
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.detail-amount {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}
	.detail-qty {
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.detail-usd {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
	}
	.detail-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		height: 32px;
		padding: 0 10px;
		border-radius: 12px;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 700;
		text-align: center;
		letter-spacing: -0.6px;
	}
	.detail-pill-purple {
		background-color: rgba(83, 67, 121, 0.5);
		color: #a984f3;
	}
	.detail-pill-teal {
		background-color: rgba(0, 147, 147, 0.25);
		color: #009393;
	}
	.detail-pill-pink {
		background-color: rgba(255, 0, 136, 0.25);
		color: #ff0088;
	}

	/* ---------- Liquidity tab — pool rows ---------- */
	.pool-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pool-row {
		display: grid;
		grid-template-columns: auto auto auto 1fr auto auto auto;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 18px;
		background-color: var(--color-surface-inset);
		border: 0;
		border-radius: 32px;
		text-align: left;
		text-decoration: none;
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.pool-row:hover {
		background-color: rgba(255, 255, 255, 0.04);
	}
	.pool-logos {
		display: inline-flex;
		align-items: center;
		margin-right: 12px;
	}
	.pool-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 12px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		color: #fff;
		overflow: hidden;
	}
	.pool-logo img {
		width: 60%;
		height: 60%;
		object-fit: contain;
	}
	.pool-logo-overlap {
		margin-left: -10px;
	}
	.pool-symbol {
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	/* .pool-spacer is the 1fr column in .pool-row — pushes pills + arrow
	 * to the right while keeping logos + symbols flush left. No styles
	 * needed beyond the grid track itself. */
	.pool-tvl {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 69px;
		height: 32px;
		padding: 0 12px;
		background-color: rgba(113, 115, 144, 0.2);
		border-radius: 12px;
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.pool-kind {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		padding: 0 12px;
		border-radius: 12px;
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.6px;
	}
	.pool-kind-concentrated {
		background-color: rgba(85, 162, 255, 0.15);
		color: #55a2ff;
	}
	.pool-kind-standard {
		background-color: rgba(115, 255, 131, 0.15);
		color: #73ff83;
	}
	.pool-arrow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-bg);
		border-radius: 50%;
		color: var(--color-text);
	}

	/* ---------- Vault tab (RWT) ---------- */
	.vault-nav-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px 20px 20px;
		background-color: var(--color-surface-inset);
		border-radius: 24px;
	}
	.vault-nav-title {
		margin: 0;
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.vault-nav-chart {
		height: 160px;
	}

	.vault-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		padding: 0 4px;
	}
	.vault-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 20px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.vault-total {
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 500;
		letter-spacing: -0.6px;
		color: #7e7190;
	}

	/* Bubble chart — fixed pseudo-cluster layout per Figma. Each bubble is
	 * an absolutely-positioned circle whose colour is set via custom prop
	 * `--bubble-glow`; the gradient + inset shadow give the orb effect. */
	/* Bubble chart is now its own component — see
	 * lib/components/charts/VaultBubbleChart.svelte. */

	.vault-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.vault-row {
		display: grid;
		grid-template-columns: 10px auto 1fr auto auto;
		column-gap: 12px;
		align-items: center;
		padding: 10px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.vault-row:last-child {
		border-bottom: 0;
	}
	.vault-row-dot {
		width: 10px;
		height: 10px;
		border-radius: 4px;
	}
	.vault-row-symbol {
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.vault-row-tokens {
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: #7e7190;
	}
	.vault-row-usd {
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.6px;
		text-align: right;
		color: var(--color-text);
	}
	.vault-row-yield {
		min-width: 60px;
		font-family: var(--font-body);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.6px;
		text-align: right;
		color: #7e7190;
	}

	/* ---------- Data tab list ---------- */
	.data-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.data-row {
		display: grid;
		grid-template-columns: 32px 1fr 32px;
		align-items: center;
		gap: 16px;
		padding: 18px 18px 18px 18px;
		background-color: var(--color-surface-inset);
		border: 1px solid transparent;
		border-radius: 32px;
		text-decoration: none;
		color: var(--color-text);
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out);
	}
	.data-row:hover {
		background-color: rgba(255, 255, 255, 0.04);
	}
	/* Pinned row gets an outlined treatment per Figma (no fill, 1px #202433 border). */
	.data-row-pinned {
		background-color: transparent;
		border-color: #202433;
	}
	.data-row-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: #353748;
		border-radius: 12px;
		color: var(--color-text);
	}
	.data-row-title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.data-row-pin {
		width: 14px;
		height: 14px;
	}
	.data-row-arrow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-bg);
		border-radius: 50%;
		color: var(--color-text);
	}

	.detail-empty {
		padding: 32px;
		background-color: var(--color-surface-inset);
		border-radius: 32px;
		text-align: center;
		font-family: var(--font-body);
		font-size: 14px;
		color: var(--color-text-muted);
	}

	/* ---------- NFT cards ---------- */
	.nft-grid {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.nft-card {
		display: grid;
		grid-template-columns: 128px 1fr;
		gap: 4px;
		padding: 4px;
		background-color: var(--color-surface-inset);
		border-radius: 32px;
	}
	.nft-cover {
		width: 128px;
		height: 128px;
		border-radius: 28px;
		overflow: hidden;
		background:
			linear-gradient(135deg, rgba(167, 139, 250, 0.35), rgba(96, 47, 220, 0.6)),
			#818181;
	}
	.nft-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.nft-body {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 16px 20px;
		background-color: var(--color-surface);
		border-radius: 28px;
		min-width: 0;
	}
	.nft-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.nft-title {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		font-family: 'Onest', var(--font-body);
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.nft-desc-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		font-size: 14px;
		line-height: 1;
		color: var(--color-text);
		opacity: 0.7;
	}
	.nft-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 12px;
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.6px;
	}
	.nft-status-on {
		background-color: rgba(115, 255, 131, 0.15);
		color: #73ff83;
	}
	.nft-status-off {
		background-color: rgba(113, 115, 144, 0.24);
		color: var(--color-text-muted);
	}
	.nft-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: #73ff83;
		box-shadow: 0 0 8px 4px rgba(115, 255, 131, 0.5);
	}
	.nft-stats {
		display: grid;
		grid-template-columns: auto auto auto;
		gap: 24px;
		justify-content: flex-start;
	}
	.nft-stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.nft-stat-label {
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
	}
	.nft-stat-value {
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	/* ---------- Mobile ---------- */
	@media (max-width: 1100px) {
		.token-grid {
			grid-template-columns: 1fr;
		}
		.stats-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	@media (max-width: 640px) {
		.stats-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
