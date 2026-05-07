<script lang="ts">
	/*
	 * Mint page — third user write-path (after Phase 7 claim + Phase 8 swap).
	 *
	 * Wires the visual mint card to the real on-chain flow:
	 *   1. RwtVault is a singleton — no pool dropdown. The vault store
	 *      owns the WS-subscribed `RwtVault` snapshot for the active cluster.
	 *   2. USDC-amount input → mintQuote.setInput → cached quote re-renders
	 *      the RWT-amount field (read-only, computed from mintQuote.result).
	 *   3. Slippage gear opens SwapSettings popover wired into
	 *      mintQuote.setSlippage (the slippage UI is shared with swap).
	 *   4. NAV badge: "1 RWT = $X.XX" rendered against `vaultStore.nav`.
	 *   5. Mint button → opens MintConfirmModal with a frozen MintIntent.
	 *      Confirm in modal → mint.start(intent) → modal walks 7 phases.
	 *
	 * Lifecycle:
	 *   - onMount: activate the vault store (opens WS sub on the singleton).
	 *   - $effect: re-activate when network.current changes (different
	 *     RwtEngine program ID per cluster ⇒ different vault PDA).
	 *   - $effect: bridge `vaultStore.vault` → `mintQuote.recompute()` so
	 *     a WS-driven NAV change re-prices the form without waiting for
	 *     the typing debounce.
	 *   - onDestroy: tear down WS subscriptions.
	 *
	 * Decisions:
	 *   - Single mint direction: USDC → RWT. Burn/redeem is a separate
	 *     phase (no on-chain ix exists yet).
	 *   - Mainnet shows an empty-state until R20 lands and the production
	 *     RwtVault deploys.
	 */
	import { onDestroy, onMount } from 'svelte';

	import AppShell from '$lib/components/sections/AppShell.svelte';
	import { Button } from '$lib/components/ui';
	import { MintConfirmModal } from '$lib/components/mint';
	import { SwapSettings } from '$lib/components/swap';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import { network } from '$lib/network/network.svelte';
	import {
		MIN_MINT_AMOUNT,
		mint,
		mintQuote,
		userBalances,
		vaultStore,
		type MintIntent
	} from '$lib/mint';
	import { applyMintSlippage } from '@areal/sdk/rwt-engine';
	import { formatTokenAmount } from '$lib/portfolio/format';
	import { Gear, Check, ThumbsUp, Bolt } from '$lib/icons';

	// USDC and RWT both use 6 decimals (rwt-engine pins this at deploy time).
	const USDC_DECIMALS = 6;
	const RWT_DECIMALS = 6;

	// ──────────────────── input state ──────────────────────────────

	let amountStr = $state('');
	let settingsOpen = $state(false);
	let modalOpen = $state(false);
	let pendingIntent = $state<MintIntent | null>(null);

	/**
	 * Parse a human-readable decimal string into base-units bigint, or
	 * `null` for malformed / negative / zero inputs. Same hand-rolled
	 * parser the swap page uses — float coercion drops precision past
	 * ~15 significant digits and we want byte-exact bigint math.
	 */
	function parseAmount(raw: string, decimals: number): bigint | null {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		if (!/^\d+(\.\d*)?$/.test(trimmed) && !/^\.\d+$/.test(trimmed)) return null;
		const [whole, frac = ''] = trimmed.split('.');
		const wholePart = whole || '0';
		const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
		try {
			const big = BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
			if (big <= 0n) return null;
			return big;
		} catch {
			return null;
		}
	}

	const amountInBigint = $derived(parseAmount(amountStr, USDC_DECIMALS));

	// Pipe the parsed amount into the quote store. Slot the effect inside
	// $effect so we don't re-fire on unrelated re-renders.
	$effect(() => {
		const amount = amountInBigint;
		if (amount === null) {
			mintQuote.setInput(0n);
		} else {
			mintQuote.setInput(amount);
		}
	});

	// Bridge: when the upstream vault snapshot mutates (WS push) or the
	// network flips, re-price the quote without waiting for the typing
	// debounce. The quote store doesn't reach into `vaultStore` reactively
	// itself (see quote.svelte.ts header for the rationale).
	$effect(() => {
		void vaultStore.vault;
		void network.current;
		mintQuote.recompute();
	});

	// ──────────────────── derived display ─────────────────────────────────

	const quoteResult = $derived(mintQuote.result);
	const expectedRwt = $derived(
		quoteResult && quoteResult.ok ? quoteResult.quote.rwtOut : null
	);
	const navAtQuote = $derived(
		quoteResult && quoteResult.ok ? quoteResult.quote.navAtQuote : null
	);
	const fees = $derived(quoteResult && quoteResult.ok ? quoteResult.quote.fees : null);
	const toAmountDisplay = $derived(
		expectedRwt !== null ? formatTokenAmount(expectedRwt, RWT_DECIMALS, RWT_DECIMALS) : ''
	);
	const quoteError = $derived(
		quoteResult && !quoteResult.ok ? quoteResult.error : null
	);

	const slippageBps = $derived(mintQuote.slippageBps);
	const minRwtOut = $derived(
		expectedRwt !== null ? applyMintSlippage(expectedRwt, slippageBps) : null
	);

	const usdcBalance = $derived(userBalances.usdc);
	const rwtBalance = $derived(userBalances.rwt);

	const usdcBalanceDisplay = $derived(
		usdcBalance !== null
			? `Balance: ${formatTokenAmount(usdcBalance, USDC_DECIMALS, 4)}`
			: ''
	);
	const rwtBalanceDisplay = $derived(
		rwtBalance !== null
			? `Balance: ${formatTokenAmount(rwtBalance, RWT_DECIMALS, 4)}`
			: ''
	);

	// NAV badge — uses the LIVE vault NAV (not the quote's frozen
	// `navAtQuote`) so the user sees real-time pricing context even
	// before they type an amount.
	const liveNav = $derived(vaultStore.nav);
	const liveNavDisplay = $derived(
		liveNav !== null ? formatTokenAmount(liveNav, USDC_DECIMALS, 4) : '—'
	);
	const mintPaused = $derived(vaultStore.mintPaused);

	// Below-minimum guard mirrors the on-chain MIN_MINT_AMOUNT constant.
	const belowMinimum = $derived(
		amountInBigint !== null && amountInBigint < MIN_MINT_AMOUNT
	);

	// ──────────────────── lifecycle ───────────────────────────────────────

	onMount(() => {
		void vaultStore.activate();
		if (wallet.publicKey) {
			void userBalances.refreshAll();
		}
	});

	// React to network changes (different cluster ⇒ different RwtEngine
	// program ID ⇒ different vault PDA). Re-activate the vault store on
	// each switch — its `activate()` is idempotent for the same PDA.
	$effect(() => {
		void network.current;
		void vaultStore.activate();
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
		vaultStore.deactivate();
	});

	// ──────────────────── actions ─────────────────────────────────────────

	function openConfirm() {
		if (!wallet.isConnected) {
			walletDialog.open('connect');
			return;
		}
		if (amountInBigint === null) return;
		if (expectedRwt === null || minRwtOut === null) return;
		if (!quoteResult || !quoteResult.ok) return;
		if (navAtQuote === null || fees === null) return;

		// Freeze a fresh intent — the FSM re-validates these against fresh
		// vault state before signature, so this snapshot is allowed to be
		// a few hundred milliseconds stale.
		pendingIntent = {
			amountIn: amountInBigint,
			minRwtOut,
			expectedRwt,
			navAtQuote,
			fees,
			slippageBps
		};
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		// Keep `pendingIntent` until the modal animation finishes — the FSM
		// drops its attempt at the same time, so the modal would render
		// stale data otherwise. Drop after a short delay, but skip if the
		// user re-opened the modal in the meantime (avoids briefly flashing
		// the prior intent).
		setTimeout(() => {
			if (!modalOpen) pendingIntent = null;
		}, 200);
	}

	function confirmMint() {
		if (!pendingIntent) return;
		void mint.start(pendingIntent);
	}

	const currentAttempt = $derived(mint.attempts.get('mint') ?? null);
	const isInFlight = $derived(
		currentAttempt !== null &&
			(currentAttempt.phase === 'preparing' ||
				currentAttempt.phase === 'awaiting-signature' ||
				currentAttempt.phase === 'broadcasting' ||
				currentAttempt.phase === 'confirming')
	);

	const vaultMissing = $derived(!vaultStore.isLoading && vaultStore.vault === null);

	const mintDisabled = $derived(
		wallet.isConnected &&
			(vaultMissing ||
				mintPaused ||
				amountInBigint === null ||
				belowMinimum ||
				expectedRwt === null ||
				quoteError !== null ||
				isInFlight)
	);

	const mintButtonLabel = $derived.by(() => {
		if (!wallet.isConnected) return 'Connect Wallet';
		if (vaultStore.isLoading && vaultStore.vault === null) return 'Loading vault…';
		if (vaultMissing) return 'Vault unavailable';
		if (mintPaused) return 'Minting paused';
		if (isInFlight) return 'Mint in progress…';
		if (amountInBigint === null) return 'Enter an amount';
		if (belowMinimum) return 'Below $1 minimum';
		if (quoteError === 'MintPaused') return 'Minting paused';
		if (quoteError === 'BelowMinMint') return 'Below $1 minimum';
		if (quoteError === 'ZeroRwtOutput') return 'Amount too small';
		if (quoteError === 'MainnetNotDeployed') return 'Mainnet not deployed';
		if (quoteError) return 'Cannot price mint';
		if (expectedRwt === null) return 'Loading quote…';
		return 'Mint';
	});

	// Click outside the settings popover to close it.
	$effect(() => {
		if (!settingsOpen) return;
		const close = () => {
			settingsOpen = false;
		};
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	const features = [
		{ icon: Check, label: 'Mint at live NAV from the on-chain vault' },
		{ icon: ThumbsUp, label: 'Backed 1:1 by the protocol’s capital base' },
		{ icon: Bolt, label: 'Single Solana transaction, no waiting periods' }
	];
</script>

<svelte:head>
	<title>Mint · Areal</title>
	<meta name="description" content="Mint RWT from USDC at live NAV from the Areal vault." />
</svelte:head>

<AppShell currentPath="/mint">
	<div class="mint-page">
		<h1 class="mint-headline">Mint RWT at live NAV</h1>

		<section class="mint-card" aria-labelledby="mint-card-title">
			<header class="mint-card-head">
				<h2 id="mint-card-title" class="mint-card-title">Mint RWT</h2>
				<div class="settings-anchor">
					<button
						class="mint-settings-btn"
						type="button"
						aria-label="Mint settings"
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
								onslippagechange={(bps) => mintQuote.setSlippage(bps)}
							/>
						</div>
					{/if}
				</div>
			</header>

			<!-- NAV badge -->
			<div class="nav-badge">
				<span class="nav-badge-label">NAV</span>
				<span class="nav-badge-value">1 RWT = ${liveNavDisplay}</span>
				{#if mintPaused}
					<span class="nav-badge-paused">Paused</span>
				{/if}
			</div>

			{#if vaultMissing}
				<div class="empty-state">
					<p class="empty-title">RWT vault unavailable on {network.label}</p>
					<p class="empty-sub">
						Switch to devnet or localnet to mint. Mainnet vault will be enabled
						once the production deploy lands.
					</p>
				</div>
			{:else}
				<div class="mint-stack">
					<!-- ─────── From row (USDC) ─────── -->
					<div class="mint-row">
						<div class="row-head">
							<span class="row-label">Pay</span>
							{#if usdcBalanceDisplay}
								<span class="row-balance">{usdcBalanceDisplay} USDC</span>
							{/if}
						</div>
						<div class="mint-token-chip mint-token-chip-static">
							<span class="mint-token-symbol">USDC</span>
						</div>
						<input
							class="mint-amount"
							type="text"
							inputmode="decimal"
							placeholder="0.00"
							bind:value={amountStr}
							aria-label="Amount of USDC to deposit"
						/>
					</div>

					<!-- ─────── To row (RWT, read-only) ─────── -->
					<div class="mint-row">
						<div class="row-head">
							<span class="row-label">Receive</span>
							{#if rwtBalanceDisplay}
								<span class="row-balance">{rwtBalanceDisplay} RWT</span>
							{/if}
						</div>
						<div class="mint-token-chip mint-token-chip-static">
							<span class="mint-token-symbol">RWT</span>
						</div>
						<input
							class="mint-amount mint-amount-readonly"
							type="text"
							readonly
							placeholder="0.00"
							value={toAmountDisplay}
							aria-label="RWT amount you will receive (computed)"
						/>
					</div>
				</div>

				{#if quoteError && quoteError !== 'ZeroAmount'}
					<p class="quote-error" role="status">
						{#if quoteError === 'MintPaused'}
							Minting is currently paused.
						{:else if quoteError === 'BelowMinMint'}
							Amount is below the $1 minimum.
						{:else if quoteError === 'ZeroRwtOutput'}
							Amount is too small for the current NAV.
						{:else if quoteError === 'MathOverflow'}
							Amount is too large.
						{:else if quoteError === 'MainnetNotDeployed'}
							Mainnet RWT vault is not deployed yet.
						{:else}
							Cannot price mint.
						{/if}
					</p>
				{:else if belowMinimum}
					<p class="quote-error" role="status">Minimum mint amount is $1.00.</p>
				{:else if expectedRwt !== null && minRwtOut !== null}
					<p class="quote-summary">
						<span>Min received: {formatTokenAmount(minRwtOut, RWT_DECIMALS, 4)} RWT</span>
						<span>· Slippage {(slippageBps / 100).toFixed(2)}%</span>
					</p>
				{/if}
			{/if}

			<Button variant="inverse" full disabled={mintDisabled} onclick={openConfirm}>
				{mintButtonLabel}
			</Button>
		</section>

		<section class="info-card" aria-labelledby="info-card-title">
			<div class="info-aurora" aria-hidden="true"></div>
			<h3 id="info-card-title" class="info-title">Why mint RWT?</h3>
			<ul class="info-grid">
				{#each features as f}
					{@const Icon = f.icon}
					<li class="info-item">
						<span class="info-item-icon">
							<Icon size={24} variant="filled" />
						</span>
						<span class="info-item-label">{f.label}</span>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</AppShell>

<MintConfirmModal
	open={modalOpen}
	intent={pendingIntent}
	attempt={currentAttempt}
	onclose={closeModal}
	onconfirm={confirmMint}
/>

<style>
	.mint-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-8) var(--space-4);
	}

	.mint-headline {
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

	/* ─── Mint card ─── */
	.mint-card {
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

	.mint-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
	}

	.mint-card-title {
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

	.mint-settings-btn {
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
	.mint-settings-btn:hover {
		background-color: var(--color-dark-700);
	}

	.settings-popover {
		position: absolute;
		top: calc(100% + var(--space-2));
		right: 0;
		z-index: 30;
	}

	/* ─── NAV badge ─── */
	.nav-badge {
		display: inline-flex;
		align-self: flex-start;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-3);
		background-color: var(--color-bg);
		border-radius: var(--radius-md);
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-xs);
	}
	.nav-badge-label {
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
	}
	.nav-badge-value {
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
	}
	.nav-badge-paused {
		padding: 0 var(--space-2);
		background-color: var(--color-danger-bg-strong);
		color: var(--color-danger);
		border-radius: var(--radius-sm);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-tight);
	}

	/* ─── Empty state for clusters with no vault ─── */
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

	/* ─── Pay / Receive rows ─── */
	.mint-row {
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

	.mint-token-chip {
		grid-area: chip;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-surface-inset);
		border: 0;
		border-radius: var(--radius-md);
		color: var(--color-text);
	}
	.mint-token-chip-static {
		cursor: default;
	}

	.mint-token-symbol {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.mint-amount {
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
	.mint-amount::placeholder {
		color: var(--color-text-muted);
	}
	.mint-amount-readonly {
		color: var(--color-text-muted);
	}

	.mint-stack {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
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

	/* ─── Why mint RWT? card ─── */
	.info-card {
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

	.info-aurora {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: url('/images/swap/dex-blur.png');
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		mix-blend-mode: screen;
		opacity: 0.5;
	}

	.info-title,
	.info-grid {
		position: relative;
		z-index: 1;
	}

	.info-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.info-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	.info-item-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		color: var(--color-text);
	}

	.info-item-label {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-snug);
		color: var(--color-text);
	}

	@media (max-width: 768px) {
		.mint-page {
			padding: var(--space-6) var(--space-4);
		}
		.info-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: var(--space-4);
		}
	}
</style>
