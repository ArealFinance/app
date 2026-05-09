<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	import {
		AppShell,
		TokenStatCard,
		MarketsLoadingShimmer,
		MarketsEmptyState
	} from '$lib/components/sections';
	import { WalletAddressChip, toast } from '$lib/components/ui';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import { network } from '$lib/network/network.svelte';
	import { markets, formatTvl, formatPrice } from '$lib/markets';
	import type { TokenRow } from '$lib/markets';

	type AvatarSpec = {
		src: string;
		/** Optional fallback colour. Most token SVGs ship with their own bg
		 * (gradient border + brand fill), so leave this empty for those. */
		bg?: string;
	};

	type Token = {
		symbol: string;
		name: string;
		tvl?: string;
		price?: string;
		delta?: string;
		state?: 'live' | 'coming-soon';
		href?: string;
		external?: boolean;
		avatar: AvatarSpec;
	};

	const avatarRwt: AvatarSpec = { src: '/images/tokens/rwt-mark.svg' };
	const avatarSparkles: AvatarSpec = { src: '/images/tokens/sparkles.svg' };
	const avatarComing: AvatarSpec = { src: '/images/tokens/coming-soon.svg', bg: '#9e60f6' };

	/**
	 * Map an on-chain `TokenRow` to the UI `Token` shape consumed by
	 * `<TokenStatCard>`. We intentionally pass `delta = undefined` rather
	 * than fabricating "0%" — the backend has no 24h price index yet, and
	 * the card hides the delta pill when it's missing (honest scope-out).
	 *
	 * Per-token TVL = sum of USDC TVL across pools where this token appears
	 * on either side. Computed against the snapshot's pool list.
	 */
	function avatarFor(symbol: string): AvatarSpec {
		const upper = symbol.toUpperCase();
		if (upper === 'RWT') return avatarRwt;
		if (upper === 'SPRK') return avatarSparkles;
		// Unknown OT — coming-soon placeholder until per-token assets ship.
		return avatarComing;
	}

	function tokenTvl(row: TokenRow): number | null {
		let sum = 0;
		let priced = false;
		for (const pool of markets.pools) {
			if (
				pool.tvlUsdc !== null &&
				(pool.tokenAMint.equals(row.mint) || pool.tokenBMint.equals(row.mint))
			) {
				sum += pool.tvlUsdc;
				priced = true;
			}
		}
		return priced ? sum : null;
	}

	function toUiToken(row: TokenRow): Token {
		return {
			symbol: row.symbol,
			name: row.name,
			tvl: formatTvl(tokenTvl(row)),
			price: formatPrice(row.priceUsdc),
			// `delta` is intentionally omitted — see comment above.
			href: `/markets/${row.symbol.toLowerCase()}`,
			avatar: avatarFor(row.symbol)
		};
	}

	const protocolTokens = $derived<Token[]>(
		markets.tokens
			.filter((t) => t.category === 'protocol' || t.category === 'ownership')
			.map(toUiToken)
	);

	const stockTokens = $derived<Token[]>(
		markets.tokens.filter((t) => t.category === 'stock').map(toUiToken)
	);

	// Coming-soon static placeholder (UI parity with the original design).
	const comingSoonCard: Token = {
		symbol: 'RWT',
		name: 'Real World Token',
		state: 'coming-soon',
		avatar: avatarComing
	};

	// Mainnet pre-launch banner — only render when:
	//   - we are on mainnet AND
	//   - the snapshot is ready AND
	//   - there are no tokens to show.
	const showMainnetEmpty = $derived(
		network.current === 'mainnet' &&
			markets.isReady &&
			protocolTokens.length === 0 &&
			stockTokens.length === 0
	);

	onMount(() => markets.start());
	onDestroy(() => markets.stop());
</script>

<svelte:head>
	<title>Areal — DeFi RWA hub with yield-bearing tokens</title>
	<meta
		name="description"
		content="Build your wealth engine via ownership tokens backed by real-world assets."
	/>
</svelte:head>

<AppShell
	currentPath="/markets"
	onSubscribe={(email) => toast.success(`Subscribed: ${email}`)}
>
	<section class="hero">
		<div class="hero-text">
			<h1 class="hero-headline">
				<span class="hero-line">
					<span>DeFi RWA</span>
					<img class="hero-glyph hero-glyph-grid" src="/images/hero/chart-tree-map.svg" alt="" />
					<span>hub</span>
				</span>
				<span class="hero-line">
					<span>with</span>
					<span class="hero-glyph hero-glyph-pill" aria-hidden="true">
						<img class="hero-pill-spark" src="/images/hero/sparkline-pill.svg" alt="" />
					</span>
					<span>yield-</span>
				</span>
				<span class="hero-line">
					<span>bearing</span>
					<img class="hero-glyph hero-glyph-mark" src="/images/hero/a-logo.svg" alt="" />
					<span class="hero-tokens">
						tokens
						<span class="hero-tokens-glow" aria-hidden="true">tokens</span>
					</span>
				</span>
			</h1>
			<p class="hero-sub">
				Build your wealth engine via ownership tokens backed by real-world assets
			</p>
			<div class="hero-cta">
				{#if wallet.isConnected && wallet.address}
					<WalletAddressChip address={wallet.address} size="md" class="hero-chip" />
				{:else}
					<button type="button" class="hero-connect" onclick={() => walletDialog.open('connect')}>
						Connect Wallet
					</button>
				{/if}
			</div>
		</div>

		<div class="hero-art" aria-hidden="true">
			<img
				src="/images/hero/crystal-composite.png"
				alt=""
				class="hero-crystal"
				width="790"
				height="748"
				fetchpriority="high"
				loading="eager"
			/>
		</div>
	</section>

	{#if showMainnetEmpty}
		<MarketsEmptyState variant="mainnet-coming-soon" />
	{:else}
		<section class="markets-section">
			<!-- Inner L-shape frame (#181A29, lighter shade), built from two overlapping
			     rounded rects: TAB (upper-left) + MAIN (lower full-width). Cards sit on top. -->
			<span class="markets-frame markets-frame-tab" aria-hidden="true"></span>
			<span class="markets-frame markets-frame-main" aria-hidden="true"></span>

			<header class="markets-head">
				<span class="markets-dot markets-dot-protocol" aria-hidden="true"></span>
				<span class="markets-label">Protocol</span>
				<span class="markets-count">{protocolTokens.length + 1}</span>
			</header>
			<div class="markets-grid">
				{#if markets.isLoading}
					<MarketsLoadingShimmer variant="card" />
					<MarketsLoadingShimmer variant="card" />
					<MarketsLoadingShimmer variant="card" />
					<MarketsLoadingShimmer variant="card" />
				{:else}
					{#each protocolTokens as t (t.symbol)}
						<TokenStatCard
							symbol={t.symbol}
							name={t.name}
							tvl={t.tvl}
							price={t.price}
							delta={t.delta}
							state={t.state}
							href={t.href}
							external={t.external}
						>
							{#snippet icon()}
								<span class="token-disk" style:background-color={t.avatar.bg ?? 'transparent'}>
									<img src={t.avatar.src} alt="" />
								</span>
							{/snippet}
						</TokenStatCard>
					{/each}
					<TokenStatCard
						symbol={comingSoonCard.symbol}
						name={comingSoonCard.name}
						state={comingSoonCard.state}
					>
						{#snippet icon()}
							<span class="token-disk" style:background-color={comingSoonCard.avatar.bg ?? 'transparent'}>
								<img src={comingSoonCard.avatar.src} alt="" />
							</span>
						{/snippet}
					</TokenStatCard>
				{/if}
			</div>
		</section>

		<section class="markets-section">
			<span class="markets-frame markets-frame-tab" aria-hidden="true"></span>
			<span class="markets-frame markets-frame-main" aria-hidden="true"></span>

			<header class="markets-head">
				<span class="markets-dot markets-dot-stocks" aria-hidden="true"></span>
				<span class="markets-label">Stocks</span>
				<span class="markets-count">{stockTokens.length + 4}</span>
			</header>
			<div class="markets-grid">
				{#if markets.isLoading}
					<MarketsLoadingShimmer variant="card" />
					<MarketsLoadingShimmer variant="card" />
					<MarketsLoadingShimmer variant="card" />
					<MarketsLoadingShimmer variant="card" />
				{:else}
					{#each stockTokens as t (t.symbol)}
						<TokenStatCard
							symbol={t.symbol}
							name={t.name}
							price={t.price}
							delta={t.delta}
							state={t.state}
							href={t.href}
							external={t.external}
						>
							{#snippet icon()}
								<span class="token-disk" style:background-color={t.avatar.bg ?? 'transparent'}>
									<img src={t.avatar.src} alt="" />
								</span>
							{/snippet}
						</TokenStatCard>
					{/each}
					<!-- 4 coming-soon static placeholders maintain the Figma 4-card row
					     until tokenised stocks ship on-chain. -->
					{#each Array.from({ length: 4 }) as _, i (i)}
						<TokenStatCard
							symbol="STOCK"
							name="Equity Token"
							state="coming-soon"
						>
							{#snippet icon()}
								<span class="token-disk" style:background-color={avatarComing.bg}>
									<img src={avatarComing.src} alt="" />
								</span>
							{/snippet}
						</TokenStatCard>
					{/each}
				{/if}
			</div>
		</section>
	{/if}
</AppShell>

<style>
	.hero {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: minmax(0, 480px) 1fr;
		gap: var(--space-6);
		align-items: start;
		/* Figma:
		 *   • hero text top at y=226, header bottom at y=82 → 144px gap.
		 *     shell-main padding-top adds 32px, hero padding-top fills the remaining 112px.
		 *   • hero text/chip bottom at y=523, markets section top at y=706 → 183px gap.
		 *     hero padding-bottom = calc(--space-24 + --space-20) ≈ 176px. */
		padding: calc(var(--space-16) + var(--space-12)) 0 calc(var(--space-24) + var(--space-20));
	}

	/* Figma layout: outer container 1214×298, bg #080A0F, rounded 24.
	 * Inside: an L-shape "Union" frame (bg #181A29, rounded 20) made of TAB
	 * (163×290 upper-left) + MAIN (full-width × 246, lower). Cards sit ON the
	 * Union frame with their own #080A0F bg (3-layer depth). */
	.markets-section {
		position: relative;
		z-index: 1;
		height: 298px;
		background-color: var(--color-surface);
		border-radius: var(--radius-xl);
		margin-bottom: var(--space-2);
	}

	.markets-frame {
		position: absolute;
		background: var(--color-surface-inset); /* #181A29 */
		border-radius: 20px;
		z-index: 0;
		pointer-events: none;
	}
	.markets-frame-tab {
		top: 4px;
		left: 4px;
		width: 163px;
		height: 290px;
	}
	.markets-frame-main {
		top: 51px;
		left: 4px;
		right: 4px;
		height: 246px;
	}

	.hero-headline {
		margin: 0 0 var(--space-6);
		font-family: var(--font-sans);
		font-weight: var(--font-weight-bold);
		font-size: var(--text-4xl); /* 48px */
		line-height: var(--leading-tight); /* 1.1 */
		letter-spacing: var(--tracking-display); /* -2px@48 */
		text-transform: uppercase;
		color: var(--color-text);
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.hero-line {
		display: inline-flex;
		align-items: center;
		/* ~1 Halvar space-width on each side of glyph for breathing room. */
		gap: 0.2em;
		flex-wrap: nowrap;
	}

	.hero-glyph {
		display: inline-block;
		flex-shrink: 0;
		vertical-align: middle;
	}

	/* Glyphs match Figma natural icon sizes (1em == 48px text size).
	 * In the line, each glyph occupies the natural inter-word slot (≈4–7 spaces of Halvar).
	 * Don't oversize — that pushes right-side text out of alignment. */
	.hero-glyph-grid {
		width: 1em; /* matches Figma chart-tree-map 48px */
		height: 1em;
	}

	/* Pill = rounded-rect bg + clean sparkline SVG fitting the pill aspect (100×51).
	 * Figma stacks Rectangle 39622 (#6D76B3 solid) + Rectangle 39623 (rgba 0.31)
	 * — visible result is solid #6D76B3 (the bottom layer shows through the alpha). */
	.hero-glyph-pill {
		position: relative;
		display: inline-block;
		width: 2.08em; /* 100 / 48 */
		height: 1.06em; /* 51 / 48 */
		background-color: #6d76b3;
		border-radius: 0.42em; /* 20 / 48 */
		flex-shrink: 0;
		overflow: hidden;
	}

	.hero-pill-spark {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	/* A-mark SVG has viewBox 95×88 with the actual letter content occupying only
	 * the inner 46×40 region (x=24..70, y=24..64). The surrounding 24px padding
	 * exists so the feGaussianBlur(stdDev 12) glow can render without clipping.
	 *
	 * Render at native viewBox size (so the blur fits) then absorb the padding
	 * via negative margin so the layout slot ≈ letter width. */
	.hero-glyph-mark {
		width: 1.97em; /* 95 / 48 — full viewBox so blur is visible */
		height: 1.83em; /* 88 / 48 */
		margin: -0.5em -0.5em; /* absorb 24px padding ≈ 0.5em on each side */
		flex-shrink: 0;
	}

	.hero-tokens {
		position: relative;
		display: inline-block;
	}

	.hero-tokens-glow {
		position: absolute;
		inset: 0;
		color: var(--color-purple-300);
		filter: blur(6px);
		pointer-events: none;
		z-index: -1;
	}

	.hero-sub {
		/* Figma: subhead at top:409, chip at top:475 → 66px gap from subhead to chip.
		 * Headline ends at top:226 + 3*52 ≈ 382, subhead at 409 → 27px gap above subhead. */
		margin: var(--space-6) 0 var(--space-10);
		font-family: var(--font-body); /* Inter Medium per Figma */
		font-weight: var(--font-weight-medium);
		font-size: var(--text-sm); /* 13 */
		color: var(--color-text);
		max-width: 481px;
		line-height: var(--leading-normal); /* 1.4 */
		letter-spacing: -0.0308em; /* -0.4px @ 13 */
	}

	.hero-cta {
		display: flex;
		gap: var(--space-3);
	}

	/* Hero chip — 245px wide to match Figma `Btn` (`384:3817`) instance under hero. */
	.hero-cta :global(.hero-chip) {
		width: 245px;
		justify-content: center;
	}

	/* Connect-wallet variant — same width as the chip so layout doesn't jump
	 * when the user disconnects/reconnects. */
	.hero-connect {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 245px;
		height: 48px;
		padding: 0 24px;
		background-color: var(--color-text);
		color: var(--color-surface);
		border: 0;
		border-radius: var(--radius-button);
		font-family: 'Halvar Breit', var(--font-sans);
		font-weight: 700;
		font-size: 14px;
		letter-spacing: -0.6px;
		text-transform: uppercase;
		cursor: pointer;
		transition: opacity var(--motion-base) var(--ease-out);
	}
	.hero-connect:hover {
		opacity: 0.9;
	}

	.hero-art {
		position: relative;
		overflow: visible;
	}

	/* Hero crystal — pre-composited PNG (Group2087330734) baked from the two Figma
	 * crystal compositions (370:3763 + 370:3764) with blur halos already applied.
	 * The PNG has empty transparent padding around the crystal — render it big and
	 * absolutely position so it overlaps the surrounding area like in Figma. */
	.hero-crystal {
		position: absolute;
		top: -220px;
		right: -110px;
		width: 790px;
		max-width: 930px;
		height: auto;
		display: block;
		pointer-events: none;
	}

	/* Header — absolute inside Tab area, top:14, left:22 (Figma container coords).
	 * dot 10×10, gap 6, "PROTOCOL" Halvar Bold 14, gap 6, badge "4" 25×24. */
	.markets-head {
		position: absolute;
		z-index: 1;
		top: 14px;
		left: 22px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		margin: 0;
		padding: 0;
		font-family: var(--font-sans); /* Halvar Breitschrift */
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-bold);
		line-height: 1.2; /* matches Figma 120% */
		text-transform: uppercase;
		letter-spacing: var(--tracking-tight); /* -0.6 */
		color: var(--color-text);
	}

	.markets-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: var(--radius-xs);
		flex-shrink: 0;
	}
	.markets-dot-protocol {
		background: linear-gradient(180deg, var(--color-purple-500), var(--color-purple-700));
	}
	.markets-dot-stocks {
		background-color: var(--color-success);
	}

	.markets-label {
		line-height: 1;
	}

	.markets-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 25px;
		height: 24px;
		padding: 0 var(--space-1);
		background: linear-gradient(180deg, var(--color-purple-500), var(--color-purple-700));
		color: var(--color-white-900);
		font-family: var(--font-body); /* Inter */
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-semibold); /* 600 per Figma */
		letter-spacing: var(--tracking-tight);
		border-radius: var(--radius-sm); /* 8 */
		font-variant-numeric: tabular-nums;
		text-transform: none;
	}

	/* Cards row — absolute, top:59 left:12 right:12, height 230 (Figma).
	 * 4 cards with 8px gap. Cards have their own bg #080A0F = contrast on Union. */
	.markets-grid {
		position: absolute;
		z-index: 1;
		top: 59px;
		left: 12px;
		right: 12px;
		height: 230px;
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2);
	}

	.token-disk {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 14px;
	}
	.token-disk img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* Responsive: below 1024px the absolute Figma layout breaks — fall back to
	 * flow layout (stacked header + 2 or 1 column grid). The L-shape Union frame
	 * is only meaningful at desktop, so we hide it on smaller viewports. */
	@media (max-width: 1024px) {
		.markets-section {
			height: auto;
			padding: 14px 12px;
		}
		.markets-frame-tab,
		.markets-frame-main {
			display: none;
		}
		.markets-head {
			position: static;
			margin-bottom: 14px;
		}
		.markets-grid {
			position: static;
			height: auto;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 768px) {
		.hero {
			grid-template-columns: 1fr;
			gap: var(--space-6);
			padding: var(--space-8) 0 var(--space-12);
		}
		.hero-text h1 {
			font-size: var(--text-3xl);
		}
		.hero-art {
			max-width: 280px;
			margin: 0 auto;
		}
	}

	@media (max-width: 480px) {
		.markets-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
