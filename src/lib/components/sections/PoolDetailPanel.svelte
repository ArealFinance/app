<script lang="ts" module>
	import type { DepthResult, PoolRow } from '@areal/sdk/markets';

	export type PoolToken = {
		symbol: string;
		bg: string;
		iconSrc?: string;
		iconLetter?: string;
	};

	export type PoolInfo = {
		id: string;
		pairA: PoolToken;
		pairB: PoolToken;
		tvlPill: string;
		kind: 'Concentrated' | 'Standard';
		totalUsd: string;
		allocation: { aPct: number; bPct: number };
		tokenA: { qty: string; usd: string; pct: string };
		tokenB: { qty: string; usd: string; pct: string };
		currentPrice: string;
		priceRange: string;
		volume24h: string;
		feeTier: string;
		fees24h: string;
		binStep: string;
		priceLabels: string[];
		userBalance: string;
		/**
		 * Optional live depth ladder for Standard pools. When present it
		 * replaces the mock distribution chart with the SDK-computed ladder.
		 */
		depth?: DepthResult | null;
		/**
		 * On-chain row + decimals required by the LP write-path. When omitted
		 * (e.g. Storybook stories fed pure mocks) the panel falls back to
		 * read-only behaviour and the CTAs render "Connect Wallet" without
		 * wiring the FSM. The markets page sets this for every real pool.
		 */
		row?: PoolRow & { isMaster: boolean };
		decimalsA?: number;
		decimalsB?: number;
	};
</script>

<script lang="ts">
	import { Bolt, Plus, Minus } from '$lib/icons';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import DepthChart from '$lib/components/charts/DepthChart.svelte';
	import MasterPoolGuard from '$lib/components/markets/MasterPoolGuard.svelte';
	import LpPositionDerived from '$lib/components/markets/LpPositionDerived.svelte';
	import { lpForm } from '$lib/markets/lp-form.svelte';
	import { lpStore } from '$lib/markets/lp-store.svelte';
	import { poolStore } from '$lib/markets/pool-store.svelte';
	import { applySlippageU128 } from '@areal/sdk/native-dex';
	import { formatTokenAmount } from '$lib/markets/format';
	import { SLIPPAGE_DEFAULT_BPS } from '$lib/swap/constants';

	type Props = {
		pool: PoolInfo;
		onclose: () => void;
	};

	let { pool, onclose }: Props = $props();

	const isConcentrated = $derived(pool.kind === 'Concentrated');
	const hasOnChain = $derived(pool.row !== undefined);
	const isMasterPool = $derived(pool.row?.isMaster ?? false);

	type ModeTab = 'Add Liquidity' | 'Withdraw';
	let modeTab = $state<ModeTab>('Add Liquidity');

	type DepositMode = 'Zap' | 'Standards';
	let depositMode = $state<DepositMode>('Zap');

	type DepositSide = 'A' | 'B';
	let depositSide = $state<DepositSide>('B');
	let depositAmount = $state('899');

	// Slippage bps — single source for both Add/Zap minShares and Remove
	// payout-floor derivation. Defaults to the swap-form default (50 bps);
	// future iterations will surface a slippage popover here too.
	const slippageBps = SLIPPAGE_DEFAULT_BPS;

	// Live LP position from the lpStore (activated by the parent route).
	const liveLpPosition = $derived(lpStore.position);
	const livePool = $derived(poolStore.pool);
	const liveShares = $derived(liveLpPosition?.shares ?? 0n);
	const hasActivePosition = $derived(wallet.isConnected && liveShares > 0n);

	// Disable Add/Zap CTAs on master pools (defense-in-depth — lpForm also
	// guards). Withdraw CTA stays enabled regardless.
	const addCtaDisabled = $derived(isMasterPool || !hasOnChain);

	function setMax() {
		depositAmount = pool.userBalance;
	}

	// Parse the user's typed amount into base-units bigint. Returns 0n on
	// any parse failure so the FSM's pre-flight zero-amount guard fires
	// rather than crashing here.
	function toBaseUnits(input: string, decimals: number): bigint {
		const s = input.trim();
		if (s === '' || !/^\d*(\.\d*)?$/.test(s)) return 0n;
		const [whole = '0', frac = ''] = s.split('.');
		const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
		try {
			return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
		} catch {
			return 0n;
		}
	}

	function handleAddLiquidity() {
		if (!pool.row || pool.decimalsA === undefined || pool.decimalsB === undefined) return;

		// `depositSide` controls which mint the user is typing. For Add we
		// require BOTH sides — derive the missing side via the pool's spot
		// ratio. For Zap we send single-side and let the contract auto-balance.
		const decA = pool.decimalsA;
		const decB = pool.decimalsB;
		const typedAmount = toBaseUnits(depositAmount, depositSide === 'A' ? decA : decB);

		if (depositMode === 'Zap') {
			const intent = {
				pool: pool.row,
				amountA: depositSide === 'A' ? typedAmount : 0n,
				amountB: depositSide === 'B' ? typedAmount : 0n,
				expectedShares: typedAmount, // best-effort placeholder; contract enforces min
				minShares: applySlippageU128(typedAmount, slippageBps),
				slippageBps
			};
			void lpForm.startZap(intent);
			return;
		}

		// Standards (both-sided). Derive the counter side from spot ratio
		// so the contract's "deposit at current ratio" check succeeds.
		const ps = livePool;
		if (!ps || ps.reserveA === 0n || ps.reserveB === 0n) {
			// Empty pool — first-deposit branch. Use 1:1 as a placeholder;
			// the user should pick both sides explicitly in a follow-up
			// iteration of this UI.
			const counterAmount = typedAmount;
			const intent = {
				pool: pool.row,
				amountA: depositSide === 'A' ? typedAmount : counterAmount,
				amountB: depositSide === 'B' ? typedAmount : counterAmount,
				expectedShares: typedAmount,
				minShares: applySlippageU128(typedAmount, slippageBps),
				slippageBps
			};
			void lpForm.startAdd(intent);
			return;
		}

		// Existing pool — derive counter side from on-chain ratio.
		let amountA: bigint;
		let amountB: bigint;
		if (depositSide === 'A') {
			amountA = typedAmount;
			amountB = (typedAmount * ps.reserveB) / ps.reserveA;
		} else {
			amountB = typedAmount;
			amountA = (typedAmount * ps.reserveA) / ps.reserveB;
		}

		// Expected shares: ratio of the typed-side amount to its reserve,
		// scaled by total LP shares. Mirrors the contract's deposit math.
		const total = ps.totalLpShares;
		const expectedShares =
			depositSide === 'A'
				? (amountA * total) / ps.reserveA
				: (amountB * total) / ps.reserveB;

		const intent = {
			pool: pool.row,
			amountA,
			amountB,
			expectedShares,
			minShares: applySlippageU128(expectedShares, slippageBps),
			slippageBps
		};
		void lpForm.startAdd(intent);
	}

	function handleRemoveLiquidity() {
		if (!pool.row) return;
		if (liveShares === 0n) return;

		// User picked a percentage of their position; convert to absolute
		// shares (rounded down).
		const sharesToBurn = (liveShares * BigInt(withdrawPct)) / 100n;
		if (sharesToBurn === 0n) return;

		// Pro-rata redemption preview from the live pool snapshot. Used by
		// the FSM's stale-quote guard against the slippage floor.
		const ps = livePool;
		const expectedA =
			ps && ps.totalLpShares > 0n ? (sharesToBurn * ps.reserveA) / ps.totalLpShares : 0n;
		const expectedB =
			ps && ps.totalLpShares > 0n ? (sharesToBurn * ps.reserveB) / ps.totalLpShares : 0n;

		const intent = {
			pool: pool.row,
			sharesToBurn,
			expectedA,
			expectedB,
			slippageBps
		};
		void lpForm.startRemove(intent);
	}

	const isAddInFlight = $derived(
		pool.row ? lpForm.isInFlight(pool.row.poolAddress) : false
	);

	// Withdraw flow — driven by the live `LpPosition.shares` rather than a
	// hard-coded demo number when the lpStore is active.
	const userSharesDisplay = $derived(liveShares > 0n ? liveShares.toString() : '0');
	let withdrawPct = $state(25);
	const withdrawSnapPoints = [0, 25, 50, 75, 100];
	const withdrawReceiveA = $derived.by(() => {
		const ps = livePool;
		if (!ps || ps.totalLpShares === 0n || liveShares === 0n) return '0';
		const sharesToBurn = (liveShares * BigInt(withdrawPct)) / 100n;
		const a = (sharesToBurn * ps.reserveA) / ps.totalLpShares;
		return formatTokenAmount(a, pool.decimalsA ?? 6);
	});
	const withdrawReceiveB = $derived.by(() => {
		const ps = livePool;
		if (!ps || ps.totalLpShares === 0n || liveShares === 0n) return '0';
		const sharesToBurn = (liveShares * BigInt(withdrawPct)) / 100n;
		const b = (sharesToBurn * ps.reserveB) / ps.totalLpShares;
		return formatTokenAmount(b, pool.decimalsB ?? 6);
	});

	// Distribution chart bar heights — from Figma dump (left ramp + center
	// peak; the right side mirrors). 24+24 keeps the marker between halves.
	const PURPLE_HEIGHTS = [
		28.05, 31.17, 34.29, 37.4, 40.52, 43.64, 47.53, 52.99, 56.89, 60.78, 64.68, 67.79, 71.69,
		74.81, 78.7, 81.04, 83.38, 86.5, 89.61, 92.73, 95.85, 95.85, 99, 103
	];
	const TEAL_HEIGHTS = [...PURPLE_HEIGHTS].reverse();

	const TICK_COUNT = 34;
	const ALLOC_TICK_COUNT = 33;
</script>

<section class="pool-shell" aria-labelledby="pool-modal-title">
	<header class="pool-header">
		<h1 id="pool-modal-title" class="pool-title">LIQUIDITY</h1>

		<div class="pool-tokens">
			<span class="pool-logo" style:background={pool.pairA.iconSrc ? 'transparent' : pool.pairA.bg}>
				{#if pool.pairA.iconSrc}
					<img src={pool.pairA.iconSrc} alt="" />
				{:else}
					<span class="pool-letter">{pool.pairA.iconLetter ?? pool.pairA.symbol[0]}</span>
				{/if}
			</span>
			<span class="pool-sym">{pool.pairA.symbol}</span>
			<span class="pool-logo" style:background={pool.pairB.iconSrc ? 'transparent' : pool.pairB.bg}>
				{#if pool.pairB.iconSrc}
					<img src={pool.pairB.iconSrc} alt="" />
				{:else}
					<span class="pool-letter">{pool.pairB.iconLetter ?? pool.pairB.symbol[0]}</span>
				{/if}
			</span>
			<span class="pool-sym">{pool.pairB.symbol}</span>
		</div>

		<div class="pool-pills">
			<span class="pill pill-tvl">{pool.tvlPill}</span>
			<span class="pill pill-kind pill-kind-{pool.kind.toLowerCase()}">{pool.kind}</span>
		</div>

		<button class="pool-close" type="button" aria-label="Close" onclick={onclose}>
			<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="M3.5 3.5l9 9M12.5 3.5l-9 9"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
				/>
			</svg>
		</button>
	</header>

	<div class="pool-grid">
		<div class="pool-col">
			<!-- ─── Value Locked ─────────────────────────────────────── -->
			<article class="card value-card">
				<p class="kpi-label">Total value locked</p>
				<p class="kpi-value">{pool.totalUsd}</p>

				<div class="alloc">
					<p class="alloc-label">Liquidity Allocation</p>
					<div class="alloc-bar">
						<span class="alloc-fill alloc-fill-a" style:width="{pool.allocation.aPct}%"></span>
						<span
							class="alloc-fill alloc-fill-b"
							style:left="{pool.allocation.aPct}%"
							style:width="{pool.allocation.bPct}%"
						></span>
						<span class="alloc-marker" style:left="{pool.allocation.aPct}%">
							<span class="alloc-marker-dot"></span>
						</span>
					</div>
					<div class="alloc-ticks">
						{#each Array.from({ length: ALLOC_TICK_COUNT }) as _, i (i)}
							<span class="alloc-tick"></span>
						{/each}
					</div>
				</div>

				<ul class="alloc-rows">
					<li class="alloc-row">
						<span class="alloc-row-dot alloc-row-dot-a"></span>
						<span class="alloc-row-sym">{pool.pairA.symbol}</span>
						<span class="alloc-row-spacer"></span>
						<span class="alloc-row-qty">
							<span class="alloc-row-qty-main">{pool.tokenA.qty}</span>
							<span class="alloc-row-qty-sub">{pool.tokenA.usd}</span>
						</span>
						<span class="alloc-row-pct alloc-row-pct-a">{pool.tokenA.pct}</span>
					</li>
					<li class="alloc-row">
						<span class="alloc-row-dot alloc-row-dot-b"></span>
						<span class="alloc-row-sym">{pool.pairB.symbol}</span>
						<span class="alloc-row-spacer"></span>
						<span class="alloc-row-qty">
							<span class="alloc-row-qty-main">{pool.tokenB.qty}</span>
							<span class="alloc-row-qty-sub">{pool.tokenB.usd}</span>
						</span>
						<span class="alloc-row-pct alloc-row-pct-b">{pool.tokenB.pct}</span>
					</li>
				</ul>
			</article>

			<!-- ─── Distribution / Pool Statistics ───────────────────── -->
			<article class="card dist-card">
				<header class="dist-header">
					<p class="dist-title">
						{isConcentrated ? 'Liquidity Distribution' : 'Pool Statistics'}
					</p>
					{#if isConcentrated}
						<span class="pill pill-range">In Range</span>
					{/if}
					<span class="pool-spacer"></span>
					<span class="legend">
						<span class="legend-dot legend-dot-a"></span>
						<span class="legend-sym">{pool.pairA.symbol}</span>
					</span>
					<span class="legend">
						<span class="legend-dot legend-dot-b"></span>
						<span class="legend-sym">{pool.pairB.symbol}</span>
					</span>
				</header>

				<div class="dist-price">
					<p class="kpi-label">Current price</p>
					<p class="dist-price-value">{pool.currentPrice}</p>
				</div>

				{#if isConcentrated}
					<!-- Concentrated pools fall back to the Figma mockup chart —
					     real per-bin depth needs a BinArray fetch (Phase 8 deferred). -->
					<div class="dist-chart">
						<div class="dist-bars dist-bars-a">
							{#each PURPLE_HEIGHTS as h, i (i)}
								<span class="dist-bar dist-bar-a" style:height="{h}px"></span>
							{/each}
						</div>
						<div class="dist-marker" aria-hidden="true">
							<span class="dist-marker-line"></span>
						</div>
						<div class="dist-bars dist-bars-b">
							{#each TEAL_HEIGHTS as h, i (i)}
								<span class="dist-bar dist-bar-b" style:height="{h}px"></span>
							{/each}
						</div>
					</div>

					<div class="dist-price-labels">
						{#each pool.priceLabels as label (label)}
							<span class="dist-price-label">{label}</span>
						{/each}
					</div>

					<div class="dist-ticks">
						{#each Array.from({ length: TICK_COUNT }) as _, i (i)}
							<span class="dist-tick" class:dist-tick-active={i === 16}></span>
						{/each}
					</div>

					<div class="dist-meta">
						<div class="dist-meta-item">
							<p class="dist-meta-label">Bin Step</p>
							<p class="dist-meta-value">{pool.binStep}</p>
						</div>
						<div class="dist-meta-item">
							<p class="dist-meta-label">Fee Tier</p>
							<p class="dist-meta-value">{pool.feeTier}</p>
						</div>
						<div class="zoom">
							<button type="button" class="zoom-btn" aria-label="Zoom in">
								<Plus size={16} />
							</button>
							<button type="button" class="zoom-btn" aria-label="Zoom out">
								<Minus size={16} />
							</button>
						</div>
					</div>
				{:else}
					<!-- Standard pools: render the SDK-computed depth ladder. The
					     chart's own empty state covers the case where depth has
					     not been fetched yet. -->
					<div class="depth-wrap">
						<DepthChart
							depth={pool.depth}
							symbolA={pool.pairA.symbol}
							symbolB={pool.pairB.symbol}
							height={150}
						/>
					</div>
				{/if}

				<div class="pool-details">
					<p class="pool-details-title">Pool Details</p>
					<div class="pool-details-grid">
						<div>
							<p class="dist-meta-label">Current Price</p>
							<p class="dist-meta-value">
								{pool.currentPrice.split(' = ')[1] ?? pool.currentPrice}
							</p>
						</div>
						{#if isConcentrated}
							<div>
								<p class="dist-meta-label">Price Range</p>
								<p class="dist-meta-value">{pool.priceRange}</p>
							</div>
						{/if}
						<div>
							<p class="dist-meta-label">24h Volume</p>
							<p class="dist-meta-value">{pool.volume24h}</p>
						</div>
						<div>
							<p class="dist-meta-label">Fee Tier</p>
							<p class="dist-meta-value">{pool.feeTier}</p>
						</div>
						<div>
							<p class="dist-meta-label">24h Fees</p>
							<p class="dist-meta-value">{pool.fees24h}</p>
						</div>
						<div>
							<p class="dist-meta-label">Pool Type</p>
							<p class="dist-meta-value">{pool.kind}</p>
						</div>
					</div>
				</div>
			</article>
		</div>

		<div class="pool-col">
			<!-- ─── My Position ─────────────────────────────────────── -->
			<article class="card position-card">
				<p class="dist-title position-title">MY POSITION</p>

				{#if hasActivePosition && hasOnChain}
					<LpPositionDerived
						symbolA={pool.pairA.symbol}
						symbolB={pool.pairB.symbol}
						decimalsA={pool.decimalsA ?? 6}
						decimalsB={pool.decimalsB ?? 6}
					/>
				{:else}
					<div class="empty">
						<svg
							class="empty-illustration"
							width="82"
							height="60"
							viewBox="0 0 82 60"
							fill="none"
							aria-hidden="true"
						>
							<rect x="1" y="1" width="80" height="28" rx="14" fill="url(#pool-empty-g1)" />
							<rect x="20" y="9" width="52" height="2.4" rx="1.2" fill="#717390" />
							<rect x="20" y="17" width="30" height="2.4" rx="1.2" fill="#717390" />
							<circle cx="11" cy="15" r="6" fill="rgba(113,115,144,0.5)" />
							<path
								d="M8.5 15.5l1.8 1.8 3.5-3.6"
								stroke="#73FF83"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								fill="none"
							/>
							<rect
								x="6"
								y="32"
								width="74"
								height="26"
								rx="13"
								fill="url(#pool-empty-g2)"
								opacity="0.5"
							/>
							<rect x="26" y="40" width="48" height="2.2" rx="1.1" fill="rgba(113,115,144,0.5)" />
							<rect x="26" y="48" width="27" height="2.2" rx="1.1" fill="rgba(113,115,144,0.5)" />
							<rect
								x="11"
								y="38"
								width="12"
								height="12"
								rx="2"
								stroke="rgba(113,115,144,0.5)"
								stroke-width="1.2"
								fill="none"
							/>
							<defs>
								<linearGradient id="pool-empty-g1" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="#3C415F" />
									<stop offset="100%" stop-color="#111322" />
								</linearGradient>
								<linearGradient id="pool-empty-g2" x1="0" y1="0" x2="0" y2="1">
									<stop offset="0%" stop-color="#3C415F" />
									<stop offset="100%" stop-color="#111322" />
								</linearGradient>
							</defs>
						</svg>
						<p class="empty-title">No Active Position</p>
						<p class="empty-sub">Add liquidity below to start earning</p>
					</div>
				{/if}
			</article>

			<!-- ─── Add Liquidity ────────────────────────────────────── -->
			<article class="card add-card">
				<div class="add-tabs" role="tablist">
					{#each ['Add Liquidity', 'Withdraw'] as t (t)}
						<button
							type="button"
							role="tab"
							aria-selected={modeTab === t}
							class="add-tab"
							class:add-tab-active={modeTab === t}
							onclick={() => (modeTab = t as ModeTab)}
						>
							{t}
							{#if modeTab === t}
								<span class="add-tab-underline" aria-hidden="true"></span>
							{/if}
						</button>
					{/each}
				</div>

				{#if modeTab === 'Add Liquidity'}
					<div class="add-mode">
						<button
							type="button"
							class="mode-pill"
							class:mode-pill-active={depositMode === 'Zap'}
							onclick={() => (depositMode = 'Zap')}
						>
							<Bolt size={16} />
							<span>Zap</span>
							<span class="mode-pill-count">1 token</span>
						</button>
						<button
							type="button"
							class="mode-pill"
							class:mode-pill-active={depositMode === 'Standards'}
							onclick={() => (depositMode = 'Standards')}
						>
							<Plus size={16} />
							<span>Standards</span>
							<span class="mode-pill-count mode-pill-count-muted">2 tokens</span>
						</button>
					</div>

					{#if depositMode === 'Zap'}
						<div class="add-alert">
							<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
								<circle cx="9" cy="9" r="8" stroke="#73FF83" stroke-width="1.5" fill="none" />
								<rect x="8.25" y="4" width="1.5" height="6.5" rx="0.75" fill="#73FF83" />
								<circle cx="9" cy="13" r="0.9" fill="#73FF83" />
							</svg>
							<span>Deposit one token. ~50% will be swapped automatically</span>
						</div>
					{/if}

					<div class="currency-grid">
						<button
							type="button"
							class="currency-card"
							class:currency-card-active={depositSide === 'B'}
							onclick={() => (depositSide = 'B')}
						>
							<span class="currency-logo" style:background={pool.pairB.iconSrc ? 'transparent' : pool.pairB.bg}>
								{#if pool.pairB.iconSrc}
									<img src={pool.pairB.iconSrc} alt="" />
								{:else}
									<span class="pool-letter">
										{pool.pairB.iconLetter ?? pool.pairB.symbol[0]}
									</span>
								{/if}
							</span>
							<span class="currency-sym">{pool.pairB.symbol}</span>
						</button>
						<button
							type="button"
							class="currency-card"
							class:currency-card-active={depositSide === 'A'}
							onclick={() => (depositSide = 'A')}
						>
							<span class="currency-logo" style:background={pool.pairA.iconSrc ? 'transparent' : pool.pairA.bg}>
								{#if pool.pairA.iconSrc}
									<img src={pool.pairA.iconSrc} alt="" />
								{:else}
									<span class="pool-letter">
										{pool.pairA.iconLetter ?? pool.pairA.symbol[0]}
									</span>
								{/if}
							</span>
							<span class="currency-sym">{pool.pairA.symbol}</span>
						</button>
					</div>

					<div class="deposit">
						<p class="deposit-label">
							Deposit {depositSide === 'A' ? pool.pairA.symbol : pool.pairB.symbol}
						</p>
						<div class="deposit-field">
							<input
								class="deposit-input"
								type="text"
								inputmode="decimal"
								placeholder="0"
								bind:value={depositAmount}
							/>
							<button type="button" class="deposit-max" onclick={setMax}>MAX</button>
						</div>
						<div class="deposit-meta">
							<span class="deposit-meta-sub">≈ $889.92</span>
							<span class="deposit-meta-sub">
								Available {pool.userBalance}
								{depositSide === 'A' ? pool.pairA.symbol : pool.pairB.symbol}
							</span>
						</div>
					</div>

					{#if isMasterPool}
						<MasterPoolGuard symbolA={pool.pairA.symbol} symbolB={pool.pairB.symbol} />
					{/if}

					{#if wallet.isConnected}
						<button
							type="button"
							class="cta"
							disabled={addCtaDisabled || isAddInFlight}
							onclick={handleAddLiquidity}
						>
							{#if isAddInFlight}
								Processing…
							{:else}
								{depositMode === 'Zap' ? 'Zap & Add Liquidity' : 'Add Liquidity'}
							{/if}
						</button>
					{:else}
						<button type="button" class="cta" onclick={() => walletDialog.open('connect')}>
							Connect Wallet
						</button>
					{/if}
				{:else}
					<!-- ─── Withdraw ───────────────────────────────────────── -->
					<div class="withdraw">
						<div class="wd-head">
							<p class="wd-label">Withdraw Liquidity</p>
							<span class="wd-available">
								<span>Available {userSharesDisplay} shares</span>
								<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
									<circle cx="8" cy="8" r="7" stroke="#73FF83" stroke-width="1.4" fill="none" />
									<rect x="7.3" y="4" width="1.4" height="5" rx="0.7" fill="#73FF83" />
									<circle cx="8" cy="11.6" r="0.85" fill="#73FF83" />
								</svg>
							</span>
						</div>

						<div class="wd-slider">
							<div class="wd-track">
								<span class="wd-fill" style:width="{withdrawPct}%"></span>
								<span class="wd-knob" style:left="{withdrawPct}%" aria-hidden="true">
									<span class="wd-knob-grip">
										<span></span><span></span><span></span><span></span>
									</span>
								</span>
								<input
									class="wd-input"
									type="range"
									min="0"
									max="100"
									step="1"
									bind:value={withdrawPct}
									aria-label="Withdraw percentage"
								/>
							</div>
							<div class="wd-marks">
								{#each withdrawSnapPoints as m (m)}
									<button
										type="button"
										class="wd-mark"
										class:wd-mark-active={Math.round(withdrawPct / 25) * 25 === m}
										onclick={() => (withdrawPct = m)}
									>
										{m}%
									</button>
								{/each}
							</div>
						</div>
					</div>

					<div class="wd-receive">
						<p class="wd-receive-label">You will receive</p>
						<div class="wd-receive-rows">
							<div class="wd-receive-row">
								<span class="wd-receive-logo" style:background={pool.pairB.iconSrc ? 'transparent' : pool.pairB.bg}>
									{#if pool.pairB.iconSrc}
										<img src={pool.pairB.iconSrc} alt="" />
									{:else}
										<span class="pool-letter">
											{pool.pairB.iconLetter ?? pool.pairB.symbol[0]}
										</span>
									{/if}
								</span>
								<span class="wd-receive-amount">
									{withdrawReceiveB}
									{pool.pairB.symbol}
								</span>
							</div>
							<div class="wd-receive-row">
								<span class="wd-receive-logo" style:background={pool.pairA.iconSrc ? 'transparent' : pool.pairA.bg}>
									{#if pool.pairA.iconSrc}
										<img src={pool.pairA.iconSrc} alt="" />
									{:else}
										<span class="pool-letter">
											{pool.pairA.iconLetter ?? pool.pairA.symbol[0]}
										</span>
									{/if}
								</span>
								<span class="wd-receive-amount">
									{withdrawReceiveA}
									{pool.pairA.symbol}
								</span>
							</div>
						</div>
					</div>

					{#if wallet.isConnected}
						<button
							type="button"
							class="cta"
							disabled={withdrawPct === 0 || liveShares === 0n || !hasOnChain || isAddInFlight}
							onclick={handleRemoveLiquidity}
						>
							{#if isAddInFlight}
								Processing…
							{:else}
								Remove Liquidity
							{/if}
						</button>
					{:else}
						<button type="button" class="cta" onclick={() => walletDialog.open('connect')}>
							Connect Wallet
						</button>
					{/if}
				{/if}
			</article>
		</div>
	</div>
</section>

<style>
	/* ─── Outer panel (modal frame body) ─────────────────────────── */
	.pool-shell {
		width: min(928px, calc(100vw - 32px));
		background-color: var(--color-surface-inset); /* #181A29 */
		border-radius: 24px;
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.pool-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px 24px;
		min-height: 56px;
	}
	.pool-title {
		margin: 0;
		font-family: 'Halvar Breit', var(--font-sans);
		font-weight: 700;
		font-size: 18px;
		line-height: 1.4;
		letter-spacing: -0.6px;
		text-transform: uppercase;
		color: var(--color-text);
	}
	.pool-tokens {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.pool-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 9px;
		overflow: hidden;
		color: #fff;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 12px;
	}
	.pool-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.pool-sym {
		font-family: var(--font-numeric);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.pool-pills {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.pool-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-surface);
		border: 0;
		border-radius: 12px;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color var(--motion-base) var(--ease-out);
	}
	.pool-close:hover {
		color: var(--color-text);
	}

	/* ─── Pills shared ───────────────────────────────────────────── */
	.pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		padding: 0 10px;
		border-radius: 12px;
		font-family: var(--font-numeric);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		white-space: nowrap;
	}
	.pill-tvl {
		background-color: var(--color-gray-900-20);
		color: var(--color-text);
	}
	.pill-kind-concentrated {
		background-color: rgba(85, 162, 255, 0.15);
		color: #55a2ff;
	}
	.pill-kind-standard {
		background-color: rgba(115, 255, 131, 0.15);
		color: #73ff83;
	}
	.pill-range {
		background-color: rgba(115, 255, 131, 0.15);
		color: #73ff83;
	}

	/* ─── Two-column grid ────────────────────────────────────────── */
	.pool-grid {
		display: grid;
		grid-template-columns: 472fr 444fr;
		gap: 4px;
	}
	.pool-col {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	@media (max-width: 768px) {
		.pool-grid {
			grid-template-columns: 1fr;
		}
	}

	/* ─── Cards (inner #080A0F) ──────────────────────────────────── */
	.card {
		position: relative;
		background-color: var(--color-surface);
		border-radius: 24px;
		padding: 24px;
	}

	/* ─── Value Locked card ──────────────────────────────────────── */
	.kpi-label {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 13px;
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
	.kpi-value {
		margin: 8px 0 24px;
		font-family: var(--font-numeric);
		font-weight: 500;
		font-size: 32px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.alloc-label {
		margin: 0 0 12px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.alloc-bar {
		position: relative;
		height: 8px;
		background-color: var(--color-surface-inset);
		border-radius: 128px;
	}
	.alloc-fill {
		position: absolute;
		top: 0;
		height: 100%;
		border-radius: 12px;
	}
	.alloc-fill-a {
		left: 0;
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.alloc-fill-b {
		background-color: #2775ca;
	}
	.alloc-marker {
		position: absolute;
		top: -4px;
		width: 2px;
		height: 16px;
		background-color: var(--color-text);
		border-radius: 12px;
		transform: translateX(-1px);
	}
	.alloc-marker-dot {
		position: absolute;
		left: 50%;
		top: -7px;
		transform: translateX(-50%);
		width: 8px;
		height: 8px;
		border-radius: 9999px;
		background-color: var(--color-surface);
		border: 1px solid #fff;
		box-sizing: border-box;
	}
	.alloc-ticks {
		display: flex;
		gap: 12px;
		margin-top: 8px;
	}
	.alloc-tick {
		display: block;
		width: 1px;
		height: 8px;
		background-color: rgba(113, 115, 144, 0.3);
	}

	.alloc-rows {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.alloc-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.alloc-row-dot {
		width: 10px;
		height: 10px;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.alloc-row-dot-a {
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.alloc-row-dot-b {
		background-color: #2775ca;
	}
	.alloc-row-sym {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.alloc-row-spacer {
		flex: 1;
	}
	.alloc-row-qty {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0;
	}
	.alloc-row-qty-main {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.alloc-row-qty-sub {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 12px;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
	}
	.alloc-row-pct {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 32px;
		border-radius: 12px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
	}
	.alloc-row-pct-a {
		background-color: rgba(83, 67, 121, 0.5);
		color: #a984f3;
	}
	.alloc-row-pct-b {
		background-color: rgba(39, 117, 202, 0.25);
		color: #55a2ff;
	}

	/* ─── Distribution card ──────────────────────────────────────── */
	.dist-card {
		display: flex;
		flex-direction: column;
	}
	.dist-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 24px;
	}
	.dist-title {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.pool-spacer {
		flex: 1;
	}
	.legend {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 4px;
	}
	.legend-dot-a {
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.legend-dot-b {
		background-color: #2775ca;
	}
	.legend-sym {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.dist-price {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-bottom: 24px;
	}
	.dist-price-value {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 18px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.dist-chart {
		position: relative;
		display: flex;
		align-items: flex-end;
		height: 110px;
		margin-bottom: 8px;
	}
	.dist-bars {
		flex: 1;
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 3px;
		min-width: 0;
	}
	.dist-bar {
		flex: 1;
		min-width: 4px;
		max-width: 8px;
		border-radius: 280px;
	}
	.dist-bar-a {
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
	}
	.dist-bar-b {
		background-color: #2775ca;
	}
	.dist-marker {
		flex: 0 0 1px;
		align-self: stretch;
		display: flex;
		justify-content: center;
		position: relative;
	}
	.dist-marker-line {
		width: 2px;
		height: 100%;
		background-color: var(--color-text);
		border-radius: 12px;
	}

	.dist-price-labels {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	.dist-price-label {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 12px;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
	}

	.dist-ticks {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 24px;
	}
	.dist-tick {
		display: block;
		width: 1px;
		height: 8px;
		background-color: rgba(113, 115, 144, 0.3);
	}
	.dist-tick-active {
		background-color: var(--color-text);
	}

	.dist-meta {
		display: flex;
		align-items: flex-end;
		gap: 32px;
		margin-bottom: 24px;
	}
	.dist-meta-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.dist-meta-label {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 12px;
		color: var(--color-text-muted);
	}
	.dist-meta-value {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 16px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.pool-details-title {
		margin: 0 0 16px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.pool-details-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		row-gap: 24px;
		column-gap: 16px;
	}
	.pool-details-grid > div {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.zoom {
		margin-left: auto;
		display: inline-flex;
		background-color: var(--color-surface-inset);
		border-radius: 16px;
		padding: 0;
	}
	.zoom-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-surface);
		border: 0;
		border-radius: 16px;
		color: var(--color-text);
		cursor: pointer;
		margin: 0;
	}
	.zoom-btn:first-child {
		margin-right: -2px;
	}

	/* Wraps the SDK-driven DepthChart (Standard pools only) in the same
	 * vertical rhythm as the concentrated mockup chart. */
	.depth-wrap {
		margin-bottom: 16px;
	}

	/* ─── My Position (empty) ────────────────────────────────────── */
	.position-card {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.position-title {
		font-family: 'Halvar Breit', var(--font-sans);
		font-weight: 700;
		font-size: 16px;
		letter-spacing: -0.6px;
		text-transform: uppercase;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
	}
	.empty-illustration {
		display: block;
	}
	.empty-title {
		margin: 16px 0 0;
		font-family: var(--font-numeric);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.empty-sub {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}

	/* ─── Add Liquidity card ─────────────────────────────────────── */
	.add-card {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.add-tabs {
		display: flex;
		gap: 24px;
		border-bottom: 0;
	}
	.add-tab {
		position: relative;
		background: transparent;
		border: 0;
		padding: 0 0 12px;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color var(--motion-base) var(--ease-out);
	}
	.add-tab:hover {
		color: var(--color-text);
	}
	.add-tab-active {
		font-weight: 700;
		color: var(--color-text);
	}
	.add-tab-underline {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 32px;
		height: 3px;
		background-color: var(--color-text);
		border-radius: 128px;
	}

	.add-mode {
		display: flex;
		gap: 8px;
	}
	.mode-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 31px;
		padding: 0 16px 0 12px;
		background-color: var(--color-gray-900-20);
		border: 0;
		border-radius: 1024px;
		color: var(--color-text);
		cursor: pointer;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 14px;
		letter-spacing: -0.6px;
	}
	.mode-pill-active {
		background-color: var(--color-text);
		color: var(--color-surface);
		font-weight: 700;
	}
	.mode-pill-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 23px;
		padding: 0 8px;
		background-color: var(--color-surface);
		color: var(--color-text);
		border-radius: 1024px;
		font-family: var(--font-numeric);
		font-weight: 500;
		font-size: 12px;
		letter-spacing: -0.6px;
	}
	.mode-pill-count-muted {
		background-color: rgba(113, 115, 144, 0.4);
	}

	.add-alert {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 48px;
		padding: 0 16px;
		background-color: rgba(115, 255, 131, 0.08);
		border-radius: 20px;
		font-family: var(--font-body);
		font-weight: 600;
		font-size: 13px;
		letter-spacing: -0.6px;
		color: #73ff83;
	}

	.currency-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.currency-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		height: 86px;
		padding: 16px;
		background-color: var(--color-surface);
		border: 1px solid rgba(113, 115, 144, 0.3);
		border-radius: 20px;
		color: var(--color-text);
		cursor: pointer;
		text-align: left;
		transition:
			border-color var(--motion-base) var(--ease-out),
			box-shadow var(--motion-base) var(--ease-out);
	}
	.currency-card:hover {
		border-color: rgba(110, 151, 255, 0.5);
	}
	.currency-card-active {
		border-color: #6e97ff;
		box-shadow: 0 0 8px rgba(110, 151, 255, 0.8);
		background-color: var(--color-surface);
	}
	.currency-card:not(.currency-card-active) {
		background-color: var(--color-surface-inset);
	}
	.currency-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 9px;
		overflow: hidden;
		color: #fff;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 12px;
	}
	.currency-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.currency-sym {
		font-family: var(--font-numeric);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.deposit {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.deposit-label {
		margin: 0;
		font-family: var(--font-numeric);
		font-weight: 500;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.deposit-field {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 64px;
		padding: 0 16px;
		background-color: #070c1c;
		border: 1px solid #333548;
		border-radius: 20px;
	}
	.deposit-input {
		flex: 1;
		background: transparent;
		border: 0;
		outline: none;
		min-width: 0;
		font-family: var(--font-numeric);
		font-weight: 500;
		font-size: 24px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.deposit-input::placeholder {
		color: var(--color-text-muted);
	}
	.deposit-max {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 31px;
		padding: 0 14px;
		background-color: var(--color-gray-900-20);
		border: 0;
		border-radius: 1024px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 13px;
		letter-spacing: -0.6px;
		color: var(--color-text);
		cursor: pointer;
	}
	.deposit-meta {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.deposit-meta-sub {
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 12px;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
	}

	.cta {
		height: 48px;
		padding: 0 24px;
		background-color: var(--color-text);
		color: var(--color-surface);
		border: 0;
		border-radius: 20px;
		font-family: 'Halvar Breit', var(--font-sans);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		text-transform: uppercase;
		cursor: pointer;
		transition: opacity var(--motion-base) var(--ease-out);
	}
	.cta:hover {
		opacity: 0.9;
	}
	.cta:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ─── Withdraw view ───────────────────────────────────────── */
	.withdraw {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		background-color: var(--color-surface-inset);
		border-radius: 20px;
	}
	.wd-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.wd-label {
		margin: 0;
		font-family: var(--font-numeric);
		font-weight: 500;
		font-size: 14px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.wd-available {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 12px;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
	}

	.wd-slider {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.wd-track {
		position: relative;
		height: 24px;
		background-color: #070c1c;
		border-radius: 20px;
	}
	.wd-fill {
		position: absolute;
		left: 2px;
		top: 2px;
		bottom: 2px;
		background-color: #001045;
		box-shadow: inset 0 0 12px #7a55ff;
		border-radius: 117px;
		transition: width 80ms linear;
		min-width: 0;
		max-width: calc(100% - 4px);
	}
	.wd-knob {
		position: absolute;
		top: 50%;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #ecedee;
		border: 4px solid var(--color-surface-inset);
		border-radius: 9999px;
		transform: translate(-50%, -50%);
		box-sizing: border-box;
		pointer-events: none;
	}
	.wd-knob-grip {
		display: grid;
		grid-template-columns: 4px 4px;
		grid-template-rows: 4px 4px;
		gap: 4px;
	}
	.wd-knob-grip span {
		width: 4px;
		height: 4px;
		background-color: rgba(113, 115, 144, 0.5);
		border-radius: 9999px;
	}
	.wd-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		background: transparent;
		opacity: 0;
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
	}
	.wd-input::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 32px;
		height: 32px;
	}
	.wd-input::-moz-range-thumb {
		width: 32px;
		height: 32px;
		border: 0;
	}

	.wd-marks {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.wd-mark {
		background: transparent;
		border: 0;
		padding: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 12px;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
		cursor: pointer;
	}
	.wd-mark-active {
		font-weight: 700;
		color: var(--color-text);
	}

	.wd-receive {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.wd-receive-label {
		margin: 0;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
	.wd-receive-rows {
		display: flex;
		gap: 24px;
	}
	.wd-receive-row {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.wd-receive-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 12px;
		overflow: hidden;
		color: #fff;
	}
	.wd-receive-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.wd-receive-amount {
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 18px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.pool-letter {
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 12px;
		color: #fff;
	}
</style>
