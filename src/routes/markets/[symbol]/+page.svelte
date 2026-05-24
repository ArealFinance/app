<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { PublicKey } from '@solana/web3.js';
	import { findAssociatedTokenAddressPda } from '@areal/sdk/pda';

	import { page } from '$app/state';
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import MarketsEmptyState from '$lib/components/sections/MarketsEmptyState.svelte';
	import MarketsLoadingShimmer from '$lib/components/sections/MarketsLoadingShimmer.svelte';
	import PriceChart from '$lib/components/charts/PriceChart.svelte';
	import TickWheel from '$lib/components/charts/TickWheel.svelte';
	import VaultBubbleChart from '$lib/components/charts/VaultBubbleChart.svelte';
	import PoolHistoryChart from '$lib/components/markets/PoolHistoryChart.svelte';
	import PoolVolumeBar from '$lib/components/markets/PoolVolumeBar.svelte';
	import type { Period } from '$lib/markets/snapshots.svelte';
	import QuickSwap from '$lib/components/sections/QuickSwap.svelte';
	import type { SwapToken } from '$lib/components/sections/QuickSwap.svelte';
	import PoolDetailPanel from '$lib/components/sections/PoolDetailPanel.svelte';
	import type { PoolInfo } from '$lib/components/sections/PoolDetailPanel.svelte';
	import { Modal, Picture } from '$lib/components/ui';
	import { ArrowUpSmall, AngleRightSmall, FileText } from '$lib/icons';

	import { network } from '$lib/network/network.svelte';
	import {
		markets,
		poolStore,
		lpStore,
		lpForm,
		formatTvl,
		formatPrice,
		formatTokenAmount,
		formatFee,
		formatHolders
	} from '$lib/markets';
	import type { TokenRow, EnrichedPoolRow } from '$lib/markets';
	import { holdersStore } from '$lib/markets/holders-store.svelte';
	import { priceFeed } from '$lib/portfolio';
	import { formatPercent } from '$lib/portfolio/format';
	import { wallet } from '$lib/stores/wallet.svelte';

	const EM_DASH = '—';

	const symbol = $derived((page.params.symbol ?? 'sprk').toLowerCase());

	/** Reactive token lookup against the live markets snapshot. */
	const tokenRow = $derived<TokenRow | null>(
		markets.tokens.find((t) => t.symbol.toLowerCase() === symbol) ?? null
	);

	const isVaultToken = $derived(tokenRow?.category === 'protocol');

	// Track this token's mint with the backend-polled holders store. The
	// store handles the initial fetch internally; we just need to register
	// (and unregister on token swap / unmount) so the polling loop knows
	// which mints to keep fresh.
	$effect(() => {
		const mint = tokenRow?.mint;
		if (!mint) return;
		holdersStore.track(mint);
		return () => holdersStore.untrack(mint);
	});

	/**
	 * 24h price change for this token, sourced from the backend-polled
	 * `priceFeed` store. Already in percent units (5.0 = 5%) at source —
	 * pass straight through `formatPercent`. Null when no daily-aggregate
	 * window is available yet (first poll, missing yesterday row).
	 */
	const change24h = $derived<number | null>(
		tokenRow ? priceFeed.change24hForMint(tokenRow.mint) : null
	);
	const change24hTone = $derived<'success' | 'danger'>(
		change24h !== null && change24h < 0 ? 'danger' : 'success'
	);

	/** Pools that touch this token on either side. */
	const tokenPools = $derived<EnrichedPoolRow[]>(
		tokenRow
			? markets.pools.filter(
					(p) => p.tokenAMint.equals(tokenRow.mint) || p.tokenBMint.equals(tokenRow.mint)
				)
			: []
	);

	/** Sum USDC TVL across all pools that touch the token. */
	const tvlUsdc = $derived.by((): number | null => {
		let sum = 0;
		let priced = false;
		for (const pool of tokenPools) {
			if (pool.tvlUsdc !== null) {
				sum += pool.tvlUsdc;
				priced = true;
			}
		}
		return priced ? sum : null;
	});

	/**
	 * One-shot total supply read. We do NOT subscribe — supply is updated
	 * on mint/burn (rare relative to swaps), and re-fetching with each
	 * pool reserve change would burn RPC for no UI benefit.
	 */
	let totalSupplyRaw = $state<bigint | null>(null);
	$effect(() => {
		const row = tokenRow;
		if (!row) {
			totalSupplyRaw = null;
			return;
		}
		const conn = network.connection;
		const target = row.mint.toBase58();
		conn
			.getTokenSupply(row.mint, 'confirmed')
			.then((res) => {
				// Late-response guard — bail if the user navigated to a
				// different token while the RPC was in-flight.
				if (tokenRow?.mint.toBase58() !== target) return;
				totalSupplyRaw = BigInt(res.value.amount);
			})
			.catch(() => {
				if (tokenRow?.mint.toBase58() !== target) return;
				totalSupplyRaw = null;
			});
	});

	/** Market cap = total_supply (whole units) × price. */
	const marketCapUsdc = $derived.by((): number | null => {
		if (!tokenRow || totalSupplyRaw === null || tokenRow.priceUsdc === null) return null;
		const supplyWhole = Number(totalSupplyRaw) / 10 ** tokenRow.decimals;
		return supplyWhole * tokenRow.priceUsdc;
	});

	/** Book NAV per RWT — only meaningful for the protocol token. */
	const navPerRwt = $derived.by((): number | null => {
		if (!isVaultToken) return null;
		const vault = markets.rwtVault;
		if (!vault || vault.totalRwtSupply === 0n) return null;
		// `nav_book_value` on-chain is per-token NAV scaled by NAV_SCALE = 1e6
		// (see contracts/rwt-engine/src/nav.rs::calculate_nav). Divide by the
		// scale to get USDC-per-RWT in whole units. NOT a ratio of two
		// 6-decimal raw values — the previous formula collapsed to capital /
		// supply with the NAV_SCALE factor missing, showing $0.0001 instead
		// of $1.0 at protocol launch.
		return Number(vault.navBookValue) / 1_000_000;
	});

	const navBookValueUsdc = $derived.by((): number | null => {
		if (!isVaultToken) return null;
		const vault = markets.rwtVault;
		if (!vault) return null;
		// Book NAV in traditional finance = total assets backing the fund.
		// On-chain: total_invested_capital (raw u128 with 6 decimals).
		return Number(vault.totalInvestedCapital) / 1_000_000;
	});

	/** SwapToken adapter for QuickSwap pinned side. */
	const pinnedToken = $derived<SwapToken | null>(
		tokenRow
			? {
					id: tokenRow.symbol.toLowerCase(),
					symbol: tokenRow.symbol,
					bg: bgForSymbol(tokenRow.symbol),
					iconLetter: tokenRow.symbol[0],
					iconSrc: iconSrcForSymbol(tokenRow.symbol)
				}
			: null
	);

	/**
	 * Tokens available on the OTHER side of QuickSwap. Derived from the
	 * tokens this page's pinned side is actually paired with on-chain
	 * (every mint that appears on either side of any of `tokenPools`,
	 * minus the pinned token itself). This replaces the static
	 * `DEFAULT_TOKENS` list inside `QuickSwap.svelte` so the dropdown
	 * never advertises a counter-token there's no pool for.
	 */
	const quickSwapCounterparts = $derived.by<SwapToken[]>(() => {
		if (!tokenRow) return [];
		const seen = new Map<string, SwapToken>();
		for (const p of tokenPools) {
			for (const m of [p.tokenAMint, p.tokenBMint]) {
				if (m.equals(tokenRow.mint)) continue;
				const key = m.toBase58();
				if (seen.has(key)) continue;
				const sym = symbolForMint(m);
				seen.set(key, {
					id: sym.toLowerCase() + '-' + key.slice(0, 4),
					symbol: sym,
					bg: bgForSymbol(sym),
					iconLetter: sym[0],
					iconSrc: iconSrcForSymbol(sym)
				});
			}
		}
		return Array.from(seen.values());
	});

	// Active chart period — bound through to <PoolHistoryChart>. The chart
	// component owns the tabs UI + labels; we keep this state here so it
	// survives modal opens / detail-tab switches without losing user intent.
	let activePeriod = $state<Period>('24H');

	type DetailTab = 'RWA’s' | 'Liquidity' | 'Data' | 'Governance' | 'RWT Vault';
	const detailTabs = $derived<DetailTab[]>(
		isVaultToken ? ['Liquidity', 'RWT Vault'] : ['RWA’s', 'Liquidity', 'Data', 'Governance']
	);
	let activeDetailTab = $state<DetailTab>('Liquidity');
	$effect(() => {
		if (!detailTabs.includes(activeDetailTab)) {
			activeDetailTab = isVaultToken ? 'RWT Vault' : 'Liquidity';
		}
	});

	type VaultPosition = {
		id: string;
		symbol: string;
		tokens: string;
		usd: string;
		yieldPct: string;
		color: string;
		bubbleSize: number;
	};

	type LiquidityPool = {
		id: string;
		poolAddress: PublicKey;
		pairA: { symbol: string; bg: string; iconLetter?: string; iconSrc?: string };
		pairB: { symbol: string; bg: string; iconLetter?: string; iconSrc?: string };
		tvl: string;
		kind: 'Concentrated' | 'Standard';
		raw: EnrichedPoolRow;
	};

	function symbolForMint(mint: PublicKey): string {
		const known = markets.tokens.find((t) => t.mint.equals(mint));
		if (known) return known.symbol;
		// USDC isn't enumerated in `markets.tokens` (which only lists OTs +
		// the synthesised RWT singleton) — match it against the cluster's
		// configured USDC mint and surface its canonical 'USDC' symbol.
		// Without this, RWT/USDC pools render the mint's base58 prefix
		// ('F9NV…' on Testnet) instead of 'USDC'.
		if (mint.equals(network.usdcMint)) return 'USDC';
		// Unknown mint → 4-char base58 prefix as a last-resort label.
		return mint.toBase58().slice(0, 4);
	}

	/**
	 * Per-mint user-balance cache (mintBase58 -> raw bigint balance).
	 * Populated by the `$effect` below whenever the open pool or wallet
	 * changes. Falls through to `0n` when an account doesn't exist (the
	 * holder simply hasn't ever held that mint yet).
	 */
	let userTokenBalances = $state(new Map<string, bigint>());

	$effect(() => {
		const pk = wallet.publicKey;
		const lp = openPoolId ? liquidityPools.find((p) => p.id === openPoolId) : null;
		if (!pk || !lp) return;
		const conn = network.connection;
		const mints = [lp.raw.tokenAMint, lp.raw.tokenBMint];
		void Promise.all(
			mints.map(async (mint) => {
				const [ata] = findAssociatedTokenAddressPda(pk, mint);
				try {
					const r = await conn.getTokenAccountBalance(ata);
					return { key: mint.toBase58(), bal: BigInt(r.value.amount) };
				} catch {
					return { key: mint.toBase58(), bal: 0n };
				}
			})
		).then((rows) => {
			const next = new Map(userTokenBalances);
			for (const r of rows) next.set(r.key, r.bal);
			userTokenBalances = next;
		});
	});

	function bgForSymbol(sym: string): string {
		const upper = sym.toUpperCase();
		if (upper === 'RWT') return '#A56EFF';
		if (upper === 'USDC' || upper === 'USDT') return '#2775CA';
		if (upper === 'SPRK') return '#4265FF';
		return '#71739044';
	}

	/**
	 * Resolve a token symbol to its canonical Figma SVG mark in
	 * `static/images/tokens/`. Returned as a public URL ready for
	 * `<img src=...>`. Falls back to `undefined` for unknown tokens —
	 * the consumer (PoolDetailPanel etc) then renders the letter
	 * placeholder on `bgForSymbol(...)`. Same icon set is used by
	 * `markets/+page.svelte::avatarFor`, `QuickSwap`, etc.
	 */
	function iconSrcForSymbol(sym: string): string | undefined {
		const upper = sym.toUpperCase();
		if (upper === 'RWT') return '/images/tokens/rwt-mark.svg';
		if (upper === 'SPRK') return '/images/tokens/sparkles.svg';
		if (upper === 'USDC') return '/images/tokens/usdc.svg';
		if (upper === 'USDT' || upper === 'USDt') return '/images/tokens/usdt-t.svg';
		return undefined;
	}

	const liquidityPools = $derived<LiquidityPool[]>(
		tokenPools.map((p) => {
			const symA = symbolForMint(p.tokenAMint);
			const symB = symbolForMint(p.tokenBMint);
			return {
				id: p.poolAddress.toBase58(),
				poolAddress: p.poolAddress,
				pairA: {
					symbol: symA,
					bg: bgForSymbol(symA),
					iconLetter: symA[0],
					iconSrc: iconSrcForSymbol(symA)
				},
				pairB: {
					symbol: symB,
					bg: bgForSymbol(symB),
					iconLetter: symB[0],
					iconSrc: iconSrcForSymbol(symB)
				},
				tvl: formatTvl(p.tvlUsdc),
				kind: p.poolType === 0 ? 'Standard' : 'Concentrated',
				raw: p
			};
		})
	);

	/**
	 * Primary pool driving the time-series chart + 24h KPI strip. Pick the
	 * highest-TVL pool that touches this token; ties fall back to insertion
	 * order. `null` until the markets snapshot has at least one matching pool.
	 */
	const primaryPool = $derived.by((): PublicKey | null => {
		if (tokenPools.length === 0) return null;
		let best = tokenPools[0]!;
		for (const p of tokenPools) {
			const bestTvl = best.tvlUsdc ?? 0;
			const cur = p.tvlUsdc ?? 0;
			if (cur > bestTvl) best = p;
		}
		return best.poolAddress;
	});

	let openPoolId = $state<string | null>(null);

	/**
	 * Tracks whether the LP form FSM is mid-flight for the currently open
	 * pool (awaiting signature, broadcasting, or confirming). Used to gate
	 * backdrop click + Escape on the pool detail Modal so a stray dismiss
	 * during signing doesn't visually orphan the user from the in-progress
	 * transaction. The FSM itself remains correct on close — this guards UX
	 * continuity, not state.
	 */
	const isLpInFlight = $derived.by((): boolean => {
		if (!openPoolId) return false;
		const lp = liquidityPools.find((p) => p.id === openPoolId);
		if (!lp) return false;
		return lpForm.isInFlight(lp.poolAddress);
	});

	const openedPool = $derived.by((): PoolInfo | null => {
		if (!openPoolId) return null;
		const lp = liquidityPools.find((p) => p.id === openPoolId);
		if (!lp) return null;
		const raw = lp.raw;

		// Token decimals lookup (markets snapshot has authoritative values).
		const tokenA = markets.tokens.find((t) => t.mint.equals(raw.tokenAMint));
		const tokenB = markets.tokens.find((t) => t.mint.equals(raw.tokenBMint));
		const decA = tokenA?.decimals ?? 6;
		const decB = tokenB?.decimals ?? 6;

		// USDC is the unit of account and is NOT enumerated in
		// `markets.tokens` (which lists only RWT + OTs), so its `priceUsdc`
		// would resolve to null and blank out the spot label, allocation bar,
		// and per-side USD values. Pin the cluster USDC mint to $1.
		const usdcMintStr = network.usdcMint.toBase58();
		const priceA =
			raw.tokenAMint.toBase58() === usdcMintStr ? 1 : (tokenA?.priceUsdc ?? null);
		const priceB =
			raw.tokenBMint.toBase58() === usdcMintStr ? 1 : (tokenB?.priceUsdc ?? null);

		// Spot price: A in B units. Avoids division-by-zero on freshly-created
		// pools (display falls back to em-dash).
		//
		// Concentrated master pools (Monotonic Ladder) are single-sided: the
		// reserves are a Nexus-funded USDC bid wall + an organic RWT ask, NOT
		// a constant-product pair. Their reserve ratio is meaningless as a
		// price (e.g. 90 USDC / 10 RWT would read "9.0000" while RWT NAV is
		// ~$1). For these pools derive spot from the token USD prices instead
		// (RWT price is NAV-derived in the SDK snapshot). StandardCurve pools
		// keep the reserve ratio — there it IS the true marginal spot price.
		let spotLabel = EM_DASH;
		if (lp.kind === 'Concentrated') {
			if (priceA !== null && priceB !== null && priceB > 0) {
				spotLabel = `1 ${lp.pairA.symbol} = ${(priceA / priceB).toFixed(4)} ${lp.pairB.symbol}`;
			}
		} else if (raw.reserveA > 0n && raw.reserveB > 0n) {
			const num = Number(raw.reserveB) / 10 ** decB;
			const den = Number(raw.reserveA) / 10 ** decA;
			if (den > 0) {
				spotLabel = `1 ${lp.pairA.symbol} = ${(num / den).toFixed(4)} ${lp.pairB.symbol}`;
			}
		}

		// Allocation pct uses USDC value when available, falling back to
		// pure reserve ratio so the bar still renders for unpriced pairs.
		let aPct = 50;
		let bPct = 50;
		if (priceA !== null && priceB !== null) {
			const aSide = (Number(raw.reserveA) / 10 ** decA) * priceA;
			const bSide = (Number(raw.reserveB) / 10 ** decB) * priceB;
			const total = aSide + bSide;
			if (total > 0) {
				aPct = Math.round((aSide / total) * 100);
				bPct = 100 - aPct;
			}
		}

		const tokenAUsd = priceA !== null
			? formatTvl((Number(raw.reserveA) / 10 ** decA) * priceA)
			: EM_DASH;
		const tokenBUsd = priceB !== null
			? formatTvl((Number(raw.reserveB) / 10 ** decB) * priceB)
			: EM_DASH;

		return {
			id: lp.id,
			pairA: lp.pairA,
			pairB: lp.pairB,
			tvlPill: lp.tvl,
			kind: lp.kind,
			totalUsd: formatTvl(raw.tvlUsdc),
			allocation: { aPct, bPct },
			tokenA: {
				qty: formatTokenAmount(raw.reserveA, decA),
				usd: tokenAUsd,
				pct: `${aPct}%`
			},
			tokenB: {
				qty: formatTokenAmount(raw.reserveB, decB),
				usd: tokenBUsd,
				pct: `${bPct}%`
			},
			currentPrice: spotLabel,
			priceRange: EM_DASH,
			volume24h: EM_DASH,
			feeTier: formatFee(raw.feeBps),
			fees24h: EM_DASH,
			binStep: EM_DASH,
			priceLabels: [],
			userBalanceA: formatTokenAmount(
				userTokenBalances.get(raw.tokenAMint.toBase58()) ?? 0n,
				decA,
				Math.min(decA, 4)
			),
			userBalanceB: formatTokenAmount(
				userTokenBalances.get(raw.tokenBMint.toBase58()) ?? 0n,
				decB,
				Math.min(decB, 4)
			),
			depth: poolStore.depth,
			row: raw,
			decimalsA: decA,
			decimalsB: decB
		};
	});

	function openPool(lp: LiquidityPool) {
		openPoolId = lp.id;
		void poolStore.activate(lp.poolAddress);
		// Activate the lpStore alongside the pool subscription when a wallet
		// is connected — drives the LpPositionDerived + Withdraw flows. The
		// effect below handles wallet-state changes after the modal opens.
		const pk = wallet.publicKey;
		if (pk) {
			void lpStore.activate(lp.poolAddress, pk);
		}
	}

	function closePool() {
		openPoolId = null;
		poolStore.deactivate();
		lpStore.deactivate();
	}

	// Auto-close the pool detail panel on network change. The Modal's
	// onclose only fires for backdrop/Escape — when the markets snapshot
	// swaps under a network switch, `openedPool` derives to null and the
	// modal unmounts silently, leaving `poolStore` listeners attached to
	// the OLD wsConnection. This effect explicitly tears the pool subscription
	// down so we don't leak a stale-cluster depth window.
	//
	// IMPORTANT: read `openPoolId` via `untrack` so this effect ONLY fires
	// on `network.current` changes. A naive read would also subscribe to
	// `openPoolId` itself — every `openPool()` call would set the id, the
	// effect would re-run, see `openPoolId !== null`, and call
	// `closePool()` synchronously, which resets it to null. Net effect: the
	// modal never opens. (Visible bug: clicking a pool row in the LIQUIDITY
	// tab did nothing.)
	$effect(() => {
		void network.current; // track network changes only
		if (untrack(() => openPoolId) !== null) {
			closePool();
		}
	});

	// Deep-link from /portfolio's "Manage" button — open the pool whose
	// address the caller passed via `?pool=<base58>` as soon as the
	// `liquidityPools` derived list contains it. Cleared after consumption
	// so a subsequent in-page navigation (e.g. Withdraw → close) doesn't
	// re-pop the modal.
	let consumedPoolQuery = $state<string | null>(null);
	$effect(() => {
		const requested = page.url.searchParams.get('pool');
		if (!requested) return;
		if (consumedPoolQuery === requested) return;
		// Wait for liquidityPools to be populated — pool detail can't open
		// until the snapshot has resolved.
		const match = liquidityPools.find((p) => p.id === requested);
		if (!match) return;
		openPool(match);
		consumedPoolQuery = requested;
	});

	// Re-activate lpStore when the wallet connects/disconnects with the
	// modal open. Active pool address is preserved in `openPoolId`.
	$effect(() => {
		const pk = wallet.publicKey;
		if (openPoolId === null) return;
		const lp = liquidityPools.find((p) => p.id === openPoolId);
		if (!lp) return;
		if (pk) {
			void lpStore.activate(lp.poolAddress, pk);
		} else {
			lpStore.deactivate();
		}
	});

	/**
	 * RWT vault composition — derived from the live markets snapshot.
	 *
	 * Each priceable non-RWT token contributes a bubble sized by its
	 * "vault-side" USD value, where value = TVL of the deepest pool that
	 * contains the token (i.e., the on-chain RWA backing depth visible
	 * to the markets reader). Bubble radius scales linearly with value;
	 * smallest bubble pinned at 70 px so the dot never collapses to a
	 * single pixel for low-TVL tokens.
	 *
	 * Yield % is the 1-day APY surfaced via `priceFeed.apyForMint`. Falls
	 * back to '—' when no daily aggregate has landed yet.
	 *
	 * Replaces a hardcoded SAND/USDC/SOL/DOT/BTC mock — kept the bubble
	 * colour palette as fallback for tokens whose category lacks a colour
	 * assignment.
	 */
	const VAULT_COLOR_FALLBACK = [
		'#7D2BF4',
		'#447AD8',
		'#44D8BA',
		'#D844C6',
		'#D89D44'
	];
	const VAULT_COLOR_BY_CATEGORY: Record<string, string> = {
		protocol: '#A56EFF',
		ownership: '#447AD8',
		stock: '#D844C6',
		// USDC bubble — official USDC brand blue. The "stable" pseudo-
		// category is invented client-side (no OT carries it); it exists
		// purely to colour-key the USDC bubble we inject below.
		stable: '#2775CA'
	};
	const vaultPositions = $derived.by<VaultPosition[]>(() => {
		const rwtMintKey = network.rwtMint.toBase58();
		const tokens = markets.snapshot?.tokens ?? [];
		const pools = markets.snapshot?.pools ?? [];

		type Row = {
			mint: PublicKey;
			symbol: string;
			category: string;
			usd: number;
		};
		const rows: Row[] = [];

		// USDC backing — the stablecoin the vault holds as protocol capital
		// against outstanding RWT. Not present in `markets.snapshot.tokens`
		// (that list only carries RWT + OT-tokens), so we synthesise it
		// from the vault's `totalInvestedCapital` field. NOT `navBookValue`
		// — that's NAV PER RWT ($1 launch value), not the total USDC
		// position. Skipped on non-vault token pages and when the vault
		// read returned null (e.g. cluster without RWT Engine deployed).
		const vault = markets.rwtVault;
		if (vault && vault.totalInvestedCapital > 0n) {
			rows.push({
				mint: network.usdcMint,
				symbol: 'USDC',
				category: 'stable',
				// `totalInvestedCapital` is a u128 in USDC base units (6
				// decimals). u128 → Number can lose precision past 2^53
				// (~9 × 10^15 ≈ $9 quadrillion USDC). Even on optimistic
				// mainnet scenarios that's wildly out of reach, so the
				// cast is safe here. If/when vault TVL approaches that
				// threshold, switch to BigInt-aware bubble-size math.
				usd: Number(vault.totalInvestedCapital) / 1_000_000
			});
		}

		for (const t of tokens) {
			if (t.mint.toBase58() === rwtMintKey) continue; // RWT itself is the vault asset
			if (t.priceUsdc === null) continue;
			let depth = 0;
			for (const p of pools) {
				if (
					p.tvlUsdc !== null &&
					(p.tokenAMint.equals(t.mint) || p.tokenBMint.equals(t.mint))
				) {
					depth = Math.max(depth, p.tvlUsdc);
				}
			}
			if (depth <= 0) continue;
			rows.push({ mint: t.mint, symbol: t.symbol, category: t.category, usd: depth });
		}
		if (rows.length === 0) return [];

		rows.sort((a, b) => b.usd - a.usd);
		const max = rows[0]!.usd;

		return rows.map((r, i) => {
			const color =
				VAULT_COLOR_BY_CATEGORY[r.category] ??
				VAULT_COLOR_FALLBACK[i % VAULT_COLOR_FALLBACK.length] ??
				'#7E7190';
			const usdHuman = formatTvl(r.usd) ?? '—';
			// Token count display — pool-derived TVL is the "underlying"
			// USD value; we don't have a clean per-token amount, so show
			// the value twice (no fake "82,000 tokens"). Backlog: read
			// mint supply from chain to populate this.
			const tokensLabel = '—';
			const apyRatio = priceFeed.apyForMint(r.mint);
			const yieldLabel =
				apyRatio === null ? '—' : `${(apyRatio * 100).toFixed(0)}%`;
			return {
				id: r.mint.toBase58(),
				symbol: r.symbol,
				tokens: tokensLabel,
				usd: usdHuman,
				yieldPct: yieldLabel,
				color,
				bubbleSize: Math.max(70, 70 + (r.usd / max) * 135)
			};
		});
	});

	// RWA breakdown / multi-asset donut deferred until the
	// ownership-token program exposes per-asset attribution. One token
	// currently maps to one underlying RWA, so a multi-row breakdown is
	// noise.

	type DataReport = { id: string; title: string; href: string; pinned?: boolean };
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
	// Single underlying RWA per OT for now. When the ownership-token
	// metadata schema gains per-asset arrays this will derive from
	// on-chain data.
	const nftCards: NftCard[] = [
		{
			id: 'mini-1',
			title: 'Mini Cooper',
			category: 'Active',
			year: '2023',
			price: '23,500 USD',
			date: '14.04.2026',
			image: '/images/rwa/mini-cooper.png'
		}
	];

	onMount(() => {
		markets.start();
		// Backend-polled APY + 24h change feed. Drives the header pill +
		// "24H change" stat cell. Idempotent — safe alongside other pages
		// that also call `start()`.
		priceFeed.start();
		// Backend-polled holder counts. Drives the "Holders" stat cell.
		// Idempotent — start() is safe to call across remount.
		holdersStore.start();
	});
	// We only deactivate the pool subscription (per-token state) on unmount;
	// the singleton snapshot stores intentionally STAY live across SPA
	// navigations so returning to a token detail page renders cached data
	// immediately (no skeleton flash). Wallet / network changes still go
	// through each store's own effect path and clear stale state there.
	onDestroy(() => {
		poolStore.deactivate();
	});
</script>

<svelte:head>
	<title>{tokenRow?.name ?? 'Token'} ({tokenRow?.symbol ?? symbol.toUpperCase()}) · Areal</title>
</svelte:head>

<AppShell currentPath="/markets">
	<div class="token-page">
		{#if !tokenRow && markets.isReady}
			<MarketsEmptyState
				variant="no-token"
				message="No on-chain token with symbol '{symbol.toUpperCase()}' exists on this network."
			/>
		{:else if tokenRow}
			{@const t = tokenRow}
			<div class="token-grid">
				<!-- ========== LEFT COLUMN: header + stats grid ========== -->
				<aside class="token-aside">
					<header class="token-head">
						<div class="token-id">
							{#if t.symbol === 'RWT' || t.symbol === 'SPRK'}
								<!-- Canonical token mark from Figma. SVG paints its own
								     gradient + radius, so no flat background-color
								     fallback. Same assets are used on /markets list,
								     /portfolio, and TokenAvatar stories. -->
								<img
									class="token-logo token-logo-img"
									src={t.symbol === 'RWT'
										? '/images/tokens/rwt-mark.svg'
										: '/images/tokens/sparkles.svg'}
									alt=""
									aria-hidden="true"
									width="44"
									height="44"
								/>
							{:else}
								<div
									class="token-logo"
									style:background-color={isVaultToken ? '#A56EFF' : '#4265FF'}
								>
									<span class="token-logo-letter">{t.symbol[0]}</span>
								</div>
							{/if}
							<div class="token-name-block">
								<div class="token-title">
									<span class="token-name">{t.name}</span>
									<span class="token-sym">{t.symbol}</span>
								</div>
								<span class="token-cat">{t.category.toUpperCase()}</span>
							</div>
						</div>

						<div class="token-price-block">
							<span class="token-price">{formatPrice(t.priceUsdc)}</span>
							{#if change24h !== null}
								<span class="apy-pill apy-pill-{change24hTone}">
									<span class="caret-icon" class:caret-down={change24hTone === 'danger'}>
										<ArrowUpSmall size={12} variant="filled" />
									</span>
									{formatPercent(change24h)}
								</span>
							{/if}
						</div>
					</header>

					<hr class="token-divider" aria-hidden="true" />

					<section class="stats-grid">
						<div class="stat-cell">
							<span class="stat-label">Price</span>
							<span class="stat-value">{formatPrice(t.priceUsdc)}</span>
						</div>
						<div class="stat-cell">
							<span class="stat-label">24H change</span>
							{#if change24h === null}
								<span class="stat-value">{EM_DASH}</span>
							{:else}
								<span class="apy-pill apy-pill-{change24hTone} stat-pill">
									<span class="caret-icon" class:caret-down={change24hTone === 'danger'}>
										<ArrowUpSmall size={12} variant="filled" />
									</span>
									{formatPercent(change24h)}
								</span>
							{/if}
						</div>
						<div class="stat-cell">
							<span class="stat-label">TVL</span>
							<span class="stat-value">{formatTvl(tvlUsdc)}</span>
						</div>
						<div class="stat-cell">
							<span class="stat-label">Book NAV</span>
							<span class="stat-value">{formatTvl(navBookValueUsdc)}</span>
						</div>
						<div class="stat-cell">
							<span class="stat-label">NAV / token</span>
							<span class="stat-value">{formatPrice(navPerRwt)}</span>
						</div>
						<div class="stat-cell">
							<span class="stat-label">Market cap</span>
							<span class="stat-value">{formatTvl(marketCapUsdc)}</span>
						</div>
						<div class="stat-cell">
							<span class="stat-label">Total supply</span>
							<span class="stat-value">
								{totalSupplyRaw !== null ? formatTokenAmount(totalSupplyRaw, t.decimals) : EM_DASH}
							</span>
						</div>
						<div class="stat-cell">
							<span class="stat-label">Holders</span>
							<span class="stat-value">{formatHolders(holdersStore.countForMint(t.mint))}</span>
						</div>
					</section>
				</aside>

				<!-- ========== CENTER COLUMN: chart + about + tabs + RWA + NFT ========== -->
				<div class="token-center">
					<PoolHistoryChart
						pool={primaryPool}
						currentPrice={formatPrice(t.priceUsdc).replace(/^\$/, '')}
						bind:period={activePeriod}
					/>

					<PoolVolumeBar pool={primaryPool} />

					<section class="about">
						<h3 class="about-title">About {t.symbol}</h3>
						<p class="about-text">
							{#if isVaultToken}
								RWT (Real World Token) is the core protocol token of Areal. It is backed by a
								diversified treasury of real-world assets and DeFi strategies, providing
								holders with sustainable yield from protocol revenue.
							{:else}
								{t.name} ({t.symbol}) is an Ownership Token in the Areal protocol. Holders
								share in the underlying RWA's revenue stream via the Yield Distribution
								merkle claims.
							{/if}
						</p>
					</section>

					<section class="detail-section">
						<div class="detail-tabs" role="tablist" aria-label="Token details">
							{#each detailTabs as tab (tab)}
								<button
									type="button"
									class="detail-tab"
									class:detail-tab-active={activeDetailTab === tab}
									role="tab"
									aria-selected={activeDetailTab === tab}
									onclick={() => (activeDetailTab = tab)}
								>
									{tab}
								</button>
							{/each}
						</div>

						{#if activeDetailTab === 'RWA’s'}
							<!--
							 Multi-asset breakdown (donut + NFT 1/2/3 rows) was the
							 Figma macet's mockup state. Production today binds one
							 OT to one underlying RWA — drop the breakdown entirely
							 and render the single asset card. When the OT metadata
							 schema gains a per-asset array this section will grow
							 back into a list with attribution.
							-->
							<div class="nft-grid">
								{#each nftCards as nft (nft.id)}
									<article class="nft-card">
										<div class="nft-cover" aria-hidden="true">
											{#if nft.image}
												<Picture src={nft.image} alt="" loading="lazy" />
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
							{#if liquidityPools.length === 0}
								<MarketsEmptyState
									variant="no-pools"
									message="There are no liquidity pools for {t.symbol} on this network yet."
								/>
							{:else}
								<ul class="pool-list">
									{#each liquidityPools as p (p.id)}
										<li>
											<button type="button" class="pool-row" onclick={() => openPool(p)}>
												<span class="pool-logos">
													<span
														class="pool-logo"
														style:background-color={p.pairA.iconSrc
															? 'transparent'
															: p.pairA.bg}
													>
														{#if p.pairA.iconSrc}
															<img src={p.pairA.iconSrc} alt="" loading="lazy" />
														{:else}
															<span>{p.pairA.iconLetter ?? p.pairA.symbol[0]}</span>
														{/if}
													</span>
													<span
														class="pool-logo pool-logo-overlap"
														style:background-color={p.pairB.iconSrc
															? 'transparent'
															: p.pairB.bg}
													>
														{#if p.pairB.iconSrc}
															<img src={p.pairB.iconSrc} alt="" loading="lazy" />
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
							{/if}
						{:else if activeDetailTab === 'RWT Vault'}
							<div class="vault-nav-card">
								<h4 class="vault-nav-title">NAV Growth</h4>
								<div class="vault-nav-chart">
									<!-- NAV history series is a backend follow-up. For now
									     surface a flat line at the current `navBookValue`
									     so the chart shape is honest about "no history yet"
									     instead of the previous fake growth curve. -->
									<PriceChart
										data={Array.from({ length: 30 }, (_, i) => ({
											x: i,
											y: navBookValueUsdc ?? 0
										}))}
									/>
								</div>
							</div>

							<header class="vault-head">
								<h3 class="vault-title">Vault Positions</h3>
								<span class="vault-total">{formatTvl(navBookValueUsdc)}</span>
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
						{:else if activeDetailTab === 'Governance'}
							<div class="detail-empty detail-empty-illustrated">
								<img
									src="/images/empty-state/governance.svg"
									alt=""
									aria-hidden="true"
									width="120"
									height="84"
								/>
								<h3 class="detail-empty-title">Governance</h3>
								<p class="detail-empty-text">Will be included in the next version</p>
							</div>
						{:else}
							<div class="detail-empty">Coming soon.</div>
						{/if}
					</section>
				</div>

				<!-- ========== RIGHT COLUMN: quick swap (current token pinned to From) ========== -->
				{#if pinnedToken}
					<div class="token-quickswap">
						<QuickSwap
							pinnedToken={pinnedToken}
							pinnedSide="from"
							tokens={quickSwapCounterparts}
						/>
					</div>
				{/if}
			</div>
		{:else}
			<!-- Markets snapshot still loading and we don't yet know if the
			     token is missing — render the layout-aware skeleton so the
			     page doesn't shift on hydration. -->
			<MarketsLoadingShimmer variant="detail" />
		{/if}
	</div>

	<Modal
		open={openedPool !== null}
		onclose={isLpInFlight ? () => {} : closePool}
		closeOnBackdrop={!isLpInFlight}
		aria-labelledby="pool-modal-title"
	>
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
		position: sticky;
		top: calc(var(--header-height-desktop) + var(--space-4));
	}
	/* ---------- Right column: quick-swap wrapper (sticky on scroll) ---------- */
	.token-quickswap {
		position: sticky;
		top: calc(var(--header-height-desktop) + var(--space-4));
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
	/* SVG token mark variant — sized to fill the logo box, no background
	 * (the SVG already paints its own purple gradient + radius). */
	.token-logo-img {
		object-fit: contain;
		object-position: center;
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
		white-space: nowrap;
	}
	.token-name {
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
		white-space: nowrap;
	}
	.token-sym {
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 500;
		letter-spacing: -0.6px;
		color: rgba(251, 242, 255, 0.5);
		white-space: nowrap;
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

	/* 24h-change pill — visual parity with `/portfolio` token-table pill
	 * (`apy-pill apy-pill-{tone}`). Drives the header price-block badge AND
	 * the "24H change" stat cell. */
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
	/* Inside the stats grid, the pill should self-align like the other
	 * single-value cells (no fill stretch) so the 18px stat row visual rhythm
	 * is preserved. */
	.stat-pill {
		align-self: flex-start;
	}

	/* Chart card styles moved to <PoolHistoryChart> in 12.3.3. */

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
		width: 100%;
		height: 100%;
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
	.detail-empty-illustrated {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: 56px 32px;
		background-color: transparent;
		border-radius: 0;
	}
	.detail-empty-illustrated img {
		width: 120px;
		height: 84px;
		display: block;
	}
	.detail-empty-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.detail-empty-text {
		margin: -8px 0 0;
		font-family: var(--font-body);
		font-size: 14px;
		letter-spacing: -0.6px;
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
	/* :global(img) lift: <Picture> renders <picture display:contents><img></picture>,
	 * placing the <img> outside this route's scoped CSS reach. */
	.nft-cover :global(img) {
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
		/* Drop sticky on stacked single-column layout — both sidebars become
		 * full-width rows and sticky would pin them awkwardly. */
		.token-aside,
		.token-quickswap {
			position: static;
			top: auto;
		}
	}
	@media (max-width: 640px) {
		.stats-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
