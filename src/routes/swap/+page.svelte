<script lang="ts">
	/*
	 * Swap page — second user write-path (after Phase 7 claim).
	 *
	 * Wires the visual swap card to the real on-chain flow:
	 *   1. Pool dropdown filtered against KNOWN_POOLS_BY_CLUSTER[network.current].
	 *   2. From-amount input → quote.setInput → cached quote re-renders the
	 *      To-amount field (read-only, computed from quote.result).
	 *   3. Slippage gear opens SwapSettings popover wired into quote.setSlippage.
	 *   4. Flip toggles aToB; the To/From labels and chips swap.
	 *   5. Swap button → opens SwapConfirmModal with a frozen SwapIntent.
	 *      Confirm in modal → swap.start(intent) → modal walks 7 phases.
	 *
	 * Lifecycle:
	 *   - onMount: activate the first available pool for the active cluster.
	 *   - $effect: re-activate when network.current changes (drops the old
	 *     subscription cycle and starts a new one).
	 *   - onDestroy: tear down WS subscriptions.
	 *
	 * Decisions:
	 *   - Exact-in only. "Specify To amount" mode is out of Phase 8 scope —
	 *     would require a quote inverter that's not in the SDK yet.
	 *   - Single-pool only. Multi-hop is also out of scope.
	 *   - Phase 8 ships USDC↔RWT only. Mainnet shows an empty-state message
	 *     until R20 lands and KNOWN_POOLS_BY_CLUSTER.mainnet is populated.
	 */
	import { onDestroy, onMount, untrack } from 'svelte';
	import { PublicKey } from '@solana/web3.js';

	import AppShell from '$lib/components/sections/AppShell.svelte';
	import { Button } from '$lib/components/ui';
	import { SwapConfirmModal, SwapSettings } from '$lib/components/swap';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import { network } from '$lib/network/network.svelte';
	import {
		KNOWN_POOLS_BY_CLUSTER,
		quote,
		swap,
		userBalances,
		type PoolEntry,
		type SwapIntent
	} from '$lib/swap';
	import { applySlippage } from '@areal/sdk/native-dex';
	import { page } from '$app/state';
	import { formatTokenAmount } from '$lib/portfolio/format';
	import {
		AngleDownSmall,
		AngleUpSmall,
		ArrowUpDownSimple,
		Gear,
		Check,
		ThumbsUp,
		Bolt
	} from '$lib/icons';

	// ──────────────────── pool & direction state ──────────────────────────

	const poolsForCluster = $derived(KNOWN_POOLS_BY_CLUSTER[network.current]);
	let activePool = $state<PoolEntry | null>(null);
	let aToB = $state(true);
	/* Per-side dropdown open flags. Was a single `poolsOpen` for the only
	 * (legacy) From-side picker; now both From and To are real token
	 * pickers, so each owns its open state and outside-click closes both. */
	let fromOpen = $state(false);
	let toOpen = $state(false);

	/**
	 * Flat list of every distinct token across the cluster's pools.
	 * Drives the From and To dropdowns. Today (one RWT/USDC pool) it has 2
	 * entries; when OT and other markets land, this auto-grows.
	 */
	type TokenInfo = { mint: PublicKey; symbol: string; decimals: number };
	const availableTokens = $derived.by<TokenInfo[]>(() => {
		const seen = new Map<string, TokenInfo>();
		for (const p of poolsForCluster) {
			const ka = p.mintA.toBase58();
			if (!seen.has(ka)) {
				seen.set(ka, { mint: p.mintA, symbol: p.symbolA, decimals: p.decimalsA });
			}
			const kb = p.mintB.toBase58();
			if (!seen.has(kb)) {
				seen.set(kb, { mint: p.mintB, symbol: p.symbolB, decimals: p.decimalsB });
			}
		}
		return Array.from(seen.values());
	});

	/** Find a pool that supports the (from, to) directed pair, with direction. */
	function findPoolForPair(
		from: PublicKey,
		to: PublicKey
	): { pool: PoolEntry; aToB: boolean } | null {
		for (const p of poolsForCluster) {
			if (p.mintA.equals(from) && p.mintB.equals(to)) return { pool: p, aToB: true };
			if (p.mintB.equals(from) && p.mintA.equals(to)) return { pool: p, aToB: false };
		}
		return null;
	}

	const fromMint = $derived<PublicKey | null>(
		activePool ? (aToB ? activePool.mintA : activePool.mintB) : null
	);
	const toMint = $derived<PublicKey | null>(
		activePool ? (aToB ? activePool.mintB : activePool.mintA) : null
	);
	const fromSymbol = $derived(
		activePool ? (aToB ? activePool.symbolA : activePool.symbolB) : ''
	);
	const toSymbol = $derived(activePool ? (aToB ? activePool.symbolB : activePool.symbolA) : '');
	const fromDecimals = $derived(
		activePool ? (aToB ? activePool.decimalsA : activePool.decimalsB) : 6
	);
	const toDecimals = $derived(
		activePool ? (aToB ? activePool.decimalsB : activePool.decimalsA) : 6
	);

	// ──────────────────── amount input state ──────────────────────────────

	let fromAmountStr = $state('');
	let settingsOpen = $state(false);
	let modalOpen = $state(false);
	let pendingIntent = $state<SwapIntent | null>(null);

	/**
	 * Parse a human-readable decimal string into base-units bigint, or
	 * `null` for malformed / negative / zero inputs. We do this manually
	 * (instead of `BigInt(parseFloat(...) * 10**decimals)`) to keep the math
	 * exact — float coercion drops precision past ~15 significant digits.
	 */
	function parseAmount(raw: string, decimals: number): bigint | null {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		// Reject anything that isn't a positive decimal.
		if (!/^\d+(\.\d*)?$/.test(trimmed) && !/^\.\d+$/.test(trimmed)) return null;
		const [whole, frac = ''] = trimmed.split('.');
		const wholePart = whole || '0';
		// Right-pad and clip the fractional part to `decimals` digits.
		const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
		try {
			const big = BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
			if (big <= 0n) return null;
			return big;
		} catch {
			return null;
		}
	}

	const amountInBigint = $derived(parseAmount(fromAmountStr, fromDecimals));

	// Pipe the parsed amount into the quote store. Slot the effect inside
	// $effect so we don't re-fire on unrelated re-renders.
	$effect(() => {
		const amount = amountInBigint;
		const from = fromMint;
		const to = toMint;
		if (!from || !to) return;
		if (amount === null) {
			quote.setInput(0n, from, to);
		} else {
			quote.setInput(amount, from, to);
		}
	});

	// ──────────────────── derived display ─────────────────────────────────

	const quoteResult = $derived(quote.result);
	const expectedOut = $derived(
		quoteResult && quoteResult.ok ? quoteResult.quote.amountOut : null
	);
	const toAmountDisplay = $derived(
		expectedOut !== null ? formatTokenAmount(expectedOut, toDecimals, toDecimals) : ''
	);
	const quoteError = $derived(
		quoteResult && !quoteResult.ok ? quoteResult.error : null
	);

	const slippageBps = $derived(quote.slippageBps);
	const minAmountOut = $derived(
		expectedOut !== null ? applySlippage(expectedOut, slippageBps) : null
	);

	// Generic per-mint balance lookup — works for USDC, RWT, SPRK, and any
	// future OT registered in `KNOWN_POOLS_BY_CLUSTER`. The previous
	// `fromSymbol === 'USDC' ? usdc : rwt` shortcut silently returned the
	// RWT balance for SPRK and any other token, surfacing wrong "Balance:"
	// numbers in the chip.
	const fromBalance = $derived<bigint | null>(
		fromMint ? userBalances.forMint(fromMint) : null
	);
	const toBalance = $derived<bigint | null>(
		toMint ? userBalances.forMint(toMint) : null
	);

	// Whenever the active pair changes, kick off a balance refresh for
	// both sides. `refreshMint` is a no-op for the wallet-disconnected
	// case (clears the map entry instead).
	$effect(() => {
		if (!wallet.publicKey) return;
		if (fromMint) void userBalances.refreshMint(fromMint);
		if (toMint) void userBalances.refreshMint(toMint);
	});

	const fromBalanceDisplay = $derived(
		fromBalance !== null
			? `Balance: ${formatTokenAmount(fromBalance, fromDecimals, 4)}`
			: ''
	);
	const toBalanceDisplay = $derived(
		toBalance !== null ? `Balance: ${formatTokenAmount(toBalance, toDecimals, 4)}` : ''
	);

	// ──────────────────── lifecycle ───────────────────────────────────────

	onMount(() => {
		// Deep-link support — `/swap?from=<sym>&to=<sym>` selects the pool
		// matching the requested pair and orients aToB so `from` is the
		// pay side. Used by the QuickSwap widget on /markets/[symbol]
		// when the user clicks its SWAP button. Falls through to the
		// default "first pool for cluster" when the params are missing
		// or the pair isn't deployed on this cluster.
		const params = page.url.searchParams;
		const fromSym = params.get('from')?.toUpperCase();
		const toSym = params.get('to')?.toUpperCase();
		let initial: PoolEntry | null = null;
		let initialAToB = true;
		if (fromSym && toSym) {
			for (const p of poolsForCluster) {
				if (p.symbolA === fromSym && p.symbolB === toSym) {
					initial = p;
					initialAToB = true;
					break;
				}
				if (p.symbolB === fromSym && p.symbolA === toSym) {
					initial = p;
					initialAToB = false;
					break;
				}
			}
		}
		const first = initial ?? poolsForCluster[0] ?? null;
		if (first) {
			activePool = first;
			aToB = initialAToB;
			void quote.activatePool(first);
		}
		// Prefill amount when caller provided it. Validation (parseAmount)
		// happens downstream — passing a bad string just won't trigger
		// the swap CTA's enable state.
		const amountParam = params.get('amount');
		if (amountParam && /^\d*\.?\d+$/.test(amountParam)) {
			fromAmountStr = amountParam;
		}
		if (wallet.publicKey) {
			void userBalances.refreshAll();
		}
	});

	// React to network changes only. We must NOT track `activePool` here —
	// any `activePool = X` assignment from `selectFromToken`/`selectToToken`
	// would re-run this effect and revert the selection to `pools[0]`,
	// silently undoing the user's pick (bug: clicking SPRK in the To
	// dropdown reset the active pool to USDC/RWT, the first entry).
	//
	// `untrack(activePool)` on the existing-pool check, network.current as
	// the sole reactive dep. The effect's job is purely "if the active
	// pool isn't valid for the new cluster, switch to the first cluster
	// pool" — selection inside the same cluster stays put.
	$effect(() => {
		const cluster = network.current;
		const pools = KNOWN_POOLS_BY_CLUSTER[cluster];
		if (pools.length === 0) {
			activePool = null;
			quote.deactivate();
			return;
		}
		const current = untrack(() => activePool);
		const stillValid =
			current !== null &&
			pools.some((p) => p.poolPda.equals(current.poolPda));
		if (stillValid) return;
		const next = pools[0]!;
		activePool = next;
		void quote.activatePool(next);
	});

	$effect(() => {
		// Keep balances in sync with wallet connect/disconnect & network.
		void network.current;
		if (wallet.publicKey) {
			void userBalances.refreshAll();
		} else {
			userBalances.reset();
		}
	});

	onDestroy(() => {
		quote.deactivate();
	});

	// ──────────────────── actions ─────────────────────────────────────────

	function flipDirection() {
		aToB = !aToB;
		// Wipe the input so the user doesn't accidentally send the wrong-
		// decimal amount the other way (USDC and RWT have the same decimals
		// today, but when more pairs land this guard becomes load-bearing).
		fromAmountStr = '';
	}

	function selectPool(entry: PoolEntry) {
		fromOpen = false;
		toOpen = false;
		if (activePool && activePool.poolPda.equals(entry.poolPda)) return;
		activePool = entry;
		fromAmountStr = '';
		void quote.activatePool(entry);
	}

	/**
	 * Pick a token for the FROM side. If the user picks the token currently
	 * occupying the To side, swap them (visually equivalent to flipping
	 * direction). Otherwise resolve a pool that connects (newFrom, currentTo);
	 * if none exists, fall back to any pool containing newFrom and pull the
	 * other side onto To.
	 */
	function selectFromToken(token: TokenInfo) {
		fromOpen = false;
		// Same token already selected — no-op.
		if (fromMint && token.mint.equals(fromMint)) return;
		// Picked the current To-side → flip direction.
		if (toMint && token.mint.equals(toMint)) {
			flipDirection();
			return;
		}
		if (toMint) {
			const match = findPoolForPair(token.mint, toMint);
			if (match) {
				activePool = match.pool;
				aToB = match.aToB;
				fromAmountStr = '';
				void quote.activatePool(match.pool);
				return;
			}
		}
		// No pool for this exact pair — pick any pool containing the new
		// From token and re-derive To from the other side.
		const fallback = poolsForCluster.find(
			(p) => p.mintA.equals(token.mint) || p.mintB.equals(token.mint)
		);
		if (fallback) {
			activePool = fallback;
			aToB = fallback.mintA.equals(token.mint);
			fromAmountStr = '';
			void quote.activatePool(fallback);
		}
	}

	/** Symmetric to selectFromToken — picks a token for the TO side. */
	function selectToToken(token: TokenInfo) {
		toOpen = false;
		if (toMint && token.mint.equals(toMint)) return;
		if (fromMint && token.mint.equals(fromMint)) {
			flipDirection();
			return;
		}
		if (fromMint) {
			const match = findPoolForPair(fromMint, token.mint);
			if (match) {
				activePool = match.pool;
				aToB = match.aToB;
				fromAmountStr = '';
				void quote.activatePool(match.pool);
				return;
			}
		}
		const fallback = poolsForCluster.find(
			(p) => p.mintA.equals(token.mint) || p.mintB.equals(token.mint)
		);
		if (fallback) {
			activePool = fallback;
			aToB = fallback.mintB.equals(token.mint);
			fromAmountStr = '';
			void quote.activatePool(fallback);
		}
	}

	function openConfirm() {
		if (!wallet.isConnected) {
			walletDialog.open('connect');
			return;
		}
		if (!activePool || !fromMint || !toMint) return;
		if (amountInBigint === null) return;
		if (expectedOut === null || minAmountOut === null) return;
		if (!quoteResult || !quoteResult.ok) return;

		// Freeze a fresh intent — the FSM re-validates these against fresh
		// reserves before signature, so this snapshot is allowed to be a
		// few hundred milliseconds stale.
		pendingIntent = {
			poolEntry: activePool,
			fromMint,
			toMint,
			aToB,
			amountIn: amountInBigint,
			minAmountOut,
			expectedOut,
			fees: quoteResult.quote.fees,
			priceImpactBps: quoteResult.quote.priceImpactBps,
			slippageBps
		};
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		// Keep `pendingIntent` until the modal animation finishes — the FSM
		// drops its attempt at the same time, so the modal would render
		// stale data otherwise. Drop after a short delay.
		setTimeout(() => {
			pendingIntent = null;
		}, 200);
	}

	function confirmSwap() {
		if (!pendingIntent) return;
		void swap.start(pendingIntent);
	}

	const currentAttempt = $derived(
		activePool ? swap.attempts.get(activePool.poolPda.toBase58()) ?? null : null
	);
	const isInFlight = $derived(currentAttempt !== null && (
		currentAttempt.phase === 'preparing' ||
		currentAttempt.phase === 'awaiting-signature' ||
		currentAttempt.phase === 'broadcasting' ||
		currentAttempt.phase === 'confirming'
	));

	const swapDisabled = $derived(
		wallet.isConnected &&
			(amountInBigint === null ||
				expectedOut === null ||
				quoteError !== null ||
				isInFlight)
	);

	const swapButtonLabel = $derived.by(() => {
		if (!wallet.isConnected) return 'Connect Wallet';
		if (isInFlight) return 'Swap in progress…';
		if (amountInBigint === null) return 'Enter an amount';
		if (quoteError === 'EmptyReserves' || quoteError === 'PoolNotActive') return 'Pool unavailable';
		if (quoteError === 'PoolPaused') return 'Trading paused';
		if (quoteError === 'ZeroOutput') return 'Amount too small';
		if (quoteError) return 'Cannot price swap';
		if (expectedOut === null) return 'Loading quote…';
		return 'Swap';
	});

	// Click outside the dropdowns to close them.
	$effect(() => {
		if (!fromOpen && !toOpen && !settingsOpen) return;
		const close = () => {
			fromOpen = false;
			toOpen = false;
			settingsOpen = false;
		};
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	const features = [
		{ icon: Check, label: 'Best rates across all liquidity pools' },
		{ icon: ThumbsUp, label: 'Low 0.5% trading fee' },
		{ icon: Bolt, label: 'Instant swaps on Solana blockchain' }
	];
</script>

<svelte:head>
	<title>Swap · Areal</title>
	<meta name="description" content="Exchange tokens at the best rates on Solana." />
</svelte:head>

<AppShell currentPath="/swap">
	<div class="swap-page">
		<h1 class="swap-headline">Exchange tokens at the best rates</h1>

		<section class="swap-card" aria-labelledby="swap-card-title">
			<header class="swap-card-head">
				<h2 id="swap-card-title" class="swap-card-title">Swap tokens</h2>
				<div class="settings-anchor">
					<button
						class="swap-settings-btn"
						type="button"
						aria-label="Swap settings"
						aria-expanded={settingsOpen}
						onclick={(e) => {
							e.stopPropagation();
							settingsOpen = !settingsOpen;
						}}
					>
						<Gear size={16} variant="duotone" />
					</button>
					{#if settingsOpen}
						<div
							class="settings-popover"
							role="dialog"
							aria-label="Slippage settings"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => {
								if (e.key === 'Escape') settingsOpen = false;
							}}
							tabindex="-1"
						>
							<SwapSettings
								slippageBps={slippageBps}
								onslippagechange={(bps) => quote.setSlippage(bps)}
							/>
						</div>
					{/if}
				</div>
			</header>

			{#if !activePool}
				<div class="empty-state">
					<p class="empty-title">No pools on {network.label}</p>
					<p class="empty-sub">
						Switch to devnet or localnet to swap. Mainnet pools will be enabled
						once the production RWT mint deploys.
					</p>
				</div>
			{:else}
				<div class="swap-stack">
					<!-- ─────── From row (token picker + amount input) ─────── -->
					<div class="swap-row" class:is-open={fromOpen}>
						<div class="row-head">
							<span class="row-label">From</span>
							{#if fromBalanceDisplay}
								<span class="row-balance">{fromBalanceDisplay} {fromSymbol}</span>
							{/if}
						</div>
						<button
							type="button"
							class="swap-token-chip"
							class:is-open={fromOpen}
							onclick={(e) => {
								e.stopPropagation();
								fromOpen = !fromOpen;
								toOpen = false;
							}}
							aria-haspopup="listbox"
							aria-expanded={fromOpen}
						>
							<span class="swap-token-symbol">{fromSymbol}</span>
							{#if fromOpen}
								<AngleUpSmall size={16} />
							{:else}
								<AngleDownSmall size={16} />
							{/if}
						</button>
						<input
							class="swap-amount"
							type="text"
							inputmode="decimal"
							placeholder="0.00"
							bind:value={fromAmountStr}
							aria-label="Amount to swap from"
						/>

						{#if fromOpen}
							<div
								class="swap-dropdown"
								role="listbox"
								tabindex="-1"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => {
									if (e.key === 'Escape') fromOpen = false;
								}}
							>
								{#each availableTokens as token (token.mint.toBase58())}
									{@const isSelected = fromMint !== null && token.mint.equals(fromMint)}
									<button
										type="button"
										class="swap-option"
										class:is-selected={isSelected}
										role="option"
										aria-selected={isSelected}
										onclick={() => selectFromToken(token)}
									>
										<span class="swap-option-symbol">{token.symbol}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- ─────── To row (token picker; amount read-only) ─────── -->
					<div class="swap-row" class:is-open={toOpen}>
						<div class="row-head">
							<span class="row-label">To</span>
							{#if toBalanceDisplay}
								<span class="row-balance">{toBalanceDisplay} {toSymbol}</span>
							{/if}
						</div>
						<button
							type="button"
							class="swap-token-chip"
							class:is-open={toOpen}
							onclick={(e) => {
								e.stopPropagation();
								toOpen = !toOpen;
								fromOpen = false;
							}}
							aria-haspopup="listbox"
							aria-expanded={toOpen}
						>
							<span class="swap-token-symbol">{toSymbol}</span>
							{#if toOpen}
								<AngleUpSmall size={16} />
							{:else}
								<AngleDownSmall size={16} />
							{/if}
						</button>
						<input
							class="swap-amount swap-amount-readonly"
							type="text"
							readonly
							placeholder="0.00"
							value={toAmountDisplay}
							aria-label="Amount to receive (computed)"
						/>

						{#if toOpen}
							<div
								class="swap-dropdown"
								role="listbox"
								tabindex="-1"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => {
									if (e.key === 'Escape') toOpen = false;
								}}
							>
								{#each availableTokens as token (token.mint.toBase58())}
									{@const isSelected = toMint !== null && token.mint.equals(toMint)}
									<button
										type="button"
										class="swap-option"
										class:is-selected={isSelected}
										role="option"
										aria-selected={isSelected}
										onclick={() => selectToToken(token)}
									>
										<span class="swap-option-symbol">{token.symbol}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Flip button. Sits between the two rows. -->
					<button
						class="swap-toggle"
						type="button"
						aria-label="Swap from and to"
						onclick={flipDirection}
					>
						<span class="swap-toggle-outer" aria-hidden="true"></span>
						<span class="swap-toggle-inner" aria-hidden="true"></span>
						<span class="swap-toggle-icon">
							<ArrowUpDownSimple size={16} />
						</span>
					</button>
				</div>

				{#if quoteError}
					<p class="quote-error" role="status">
						{#if quoteError === 'EmptyReserves' || quoteError === 'PoolNotActive'}
							Pool is unavailable.
						{:else if quoteError === 'PoolPaused'}
							Trading is paused.
						{:else if quoteError === 'ZeroOutput'}
							Amount is too small to swap.
						{:else if quoteError === 'ZeroAmount'}
							Enter an amount to swap.
						{:else}
							Cannot price swap.
						{/if}
					</p>
				{:else if expectedOut !== null && minAmountOut !== null}
					<p class="quote-summary">
						<span>Min received: {formatTokenAmount(minAmountOut, toDecimals, 4)} {toSymbol}</span>
						<span>· Slippage {(slippageBps / 100).toFixed(2)}%</span>
					</p>
				{/if}
			{/if}

			<Button variant="inverse" full disabled={swapDisabled} onclick={openConfirm}>
				{swapButtonLabel}
			</Button>
		</section>

		<section class="dex-card" aria-labelledby="dex-card-title">
			<div class="dex-aurora" aria-hidden="true"></div>
			<h3 id="dex-card-title" class="dex-title">Why use our DEX?</h3>
			<ul class="dex-grid">
				{#each features as f}
					{@const Icon = f.icon}
					<li class="dex-item">
						<span class="dex-item-icon">
							<Icon size={24} variant="filled" />
						</span>
						<span class="dex-item-label">{f.label}</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</AppShell>

<SwapConfirmModal
	open={modalOpen}
	intent={pendingIntent}
	attempt={currentAttempt}
	onclose={closeModal}
	onconfirm={confirmSwap}
/>

<style>
	.swap-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-8) var(--space-4);
	}

	.swap-headline {
		margin: 0 0 var(--space-2);
		max-width: 371px;
		font-family: var(--font-sans);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-snug);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		text-align: center;
	}

	/* ─── Swap card ─── */
	.swap-card {
		position: relative;
		width: 100%;
		max-width: 500px;
		padding: var(--space-4);
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-xl);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.swap-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
	}

	.swap-card-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.settings-anchor {
		position: relative;
	}

	.swap-settings-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-bg);
		color: var(--color-text);
		border: 0;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.swap-settings-btn:hover {
		background-color: var(--color-dark-700);
	}

	.settings-popover {
		position: absolute;
		top: calc(100% + var(--space-2));
		right: 0;
		z-index: 30;
	}

	/* ─── Empty state for clusters with no pools ─── */
	.empty-state {
		padding: var(--space-6) var(--space-4);
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.empty-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		color: var(--color-text);
	}
	.empty-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	/* ─── From / To rows ─── */
	.swap-row {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto 1fr;
		grid-template-areas:
			'head head'
			'chip amount';
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3);
		background-color: var(--color-bg);
		border-radius: var(--radius-lg);
	}
	.swap-row.is-open {
		z-index: 10;
	}

	.row-head {
		grid-area: head;
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
	}
	.row-label {
		font-family: 'Onest', var(--font-body);
		font-size: 11px;
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}
	.row-balance {
		font-family: 'Onest', var(--font-body);
		font-size: 11px;
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}

	.swap-token-chip {
		grid-area: chip;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-surface-inset);
		border: 0;
		border-radius: var(--radius-md);
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.swap-token-chip:hover,
	.swap-token-chip.is-open {
		background-color: var(--color-dark-700);
		filter: brightness(1.1);
	}
	.swap-token-symbol {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.swap-amount {
		grid-area: amount;
		width: 100%;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: none;
		padding: 0 var(--space-2);
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		text-align: right;
		color: var(--color-text);
	}
	.swap-amount::placeholder {
		color: var(--color-text-muted);
	}
	.swap-amount-readonly {
		color: var(--color-text-muted);
	}

	.swap-dropdown {
		position: absolute;
		top: calc(100% + var(--space-2));
		left: 0;
		right: 0;
		grid-column: 1 / -1;
		z-index: 20;
		padding: var(--space-2);
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-overlay);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-height: 320px;
		overflow-y: auto;
	}

	.swap-option {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		background-color: var(--color-bg);
		border: 2px solid transparent;
		border-radius: var(--radius-lg);
		color: var(--color-text);
		cursor: pointer;
		text-align: left;
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out);
	}
	.swap-option:hover {
		background-color: var(--color-dark-700);
	}
	.swap-option.is-selected {
		border-color: var(--color-purple-300);
	}

	.swap-option-symbol {
		font-family: var(--font-sans);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.swap-stack {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.swap-toggle {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 36px;
		height: 36px;
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
		z-index: 1;
	}
	.swap-toggle-outer {
		position: absolute;
		inset: 0;
		background-color: var(--color-bg);
		border-radius: 12px;
		transform: rotate(45deg);
	}
	.swap-toggle-inner {
		position: absolute;
		inset: 6px;
		background-color: var(--color-surface-inset);
		border-radius: 8px;
		transform: rotate(-45deg);
	}
	.swap-toggle-icon {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text);
	}

	.quote-error {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		color: var(--color-danger);
		text-align: center;
	}
	.quote-summary {
		margin: 0;
		display: flex;
		justify-content: center;
		gap: var(--space-2);
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	/* ─── Why use our DEX? card ─── */
	.dex-card {
		position: relative;
		width: 100%;
		max-width: 500px;
		padding: var(--space-4) var(--space-5);
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.dex-aurora {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: url('/images/swap/dex-blur.png');
		background-image: image-set(
			url('/images/swap/dex-blur.avif') type('image/avif'),
			url('/images/swap/dex-blur.webp') type('image/webp'),
			url('/images/swap/dex-blur.png') type('image/png')
		);
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		mix-blend-mode: screen;
		opacity: 0.7;
	}

	.dex-title,
	.dex-grid {
		position: relative;
		z-index: 1;
	}

	.dex-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.dex-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.dex-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	.dex-item-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		color: var(--color-text);
	}

	.dex-item-label {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-snug);
		color: var(--color-text);
	}

	@media (max-width: 768px) {
		.swap-page {
			padding: var(--space-6) var(--space-4);
		}
		.dex-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: var(--space-4);
		}
	}
</style>
