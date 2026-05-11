<script lang="ts" module>
	export type SwapToken = {
		id: string;
		symbol: string;
		bg: string;
		iconSrc?: string;
		iconLetter?: string;
	};

	export type SwapSide = 'from' | 'to';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import { AngleDownSmall, AngleUpSmall, ArrowUpDownSimple, Gear } from '$lib/icons';

	type Props = {
		/** Token pinned to one side (e.g. the current token on a /markets/[symbol] page). */
		pinnedToken: SwapToken;
		/** Which side the pinned token sits on. Default 'from'. */
		pinnedSide?: SwapSide;
		/** Tokens available for the OTHER (selectable) side. */
		tokens?: SwapToken[];
		/** Initial selected token on the other side. Defaults to first non-pinned token. */
		initialOther?: SwapToken;
	};

	const DEFAULT_TOKENS: SwapToken[] = [
		{
			id: 'rwt',
			symbol: 'RWT',
			bg: 'linear-gradient(135deg, #a56eff 0%, #602fdc 100%)',
			iconSrc: '/images/tokens/rwt-mark.svg'
		},
		{ id: 'usdt', symbol: 'USDt', bg: '#009393', iconSrc: '/images/tokens/usdt-t.svg' },
		{ id: 'usdc', symbol: 'USDC', bg: '#2775ca', iconSrc: '/images/tokens/usdc.svg' },
		{ id: 'sprk', symbol: 'SPRK', bg: '#4265ff', iconSrc: '/images/tokens/sparkles.svg' }
	];

	let {
		pinnedToken,
		pinnedSide: initialPinnedSide = 'from',
		tokens = DEFAULT_TOKENS,
		initialOther
	}: Props = $props();

	let pinnedSide = $state<SwapSide>(untrack(() => initialPinnedSide));
	function flip() {
		pinnedSide = pinnedSide === 'from' ? 'to' : 'from';
		[pinnedAmount, otherAmount] = [otherAmount, pinnedAmount];
	}

	const otherCandidates = $derived(tokens.filter((t) => t.id !== pinnedToken.id));
	let other = $state<SwapToken>(untrack(() => initialOther ?? otherCandidates[0]));
	$effect(() => {
		if (!pinnedToken || !other) return;
		if (other.id === pinnedToken.id) {
			const next = otherCandidates[0];
			if (next) other = next;
		}
	});
	let pinnedAmount = $state('');
	let otherAmount = $state('');
	let isOtherOpen = $state(false);

	function pickOther(t: SwapToken) {
		other = t;
		isOtherOpen = false;
	}

	function toggleOtherDropdown(e: MouseEvent) {
		e.stopPropagation();
		isOtherOpen = !isOtherOpen;
	}

	$effect(() => {
		if (!isOtherOpen) return;
		const close = () => {
			isOtherOpen = false;
		};
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	const fromSide = $derived(pinnedSide === 'from' ? 'pinned' : 'other');
	const toSide = $derived(pinnedSide === 'from' ? 'other' : 'pinned');

	const fromToken = $derived(pinnedSide === 'from' ? pinnedToken : other);
	const toToken = $derived(pinnedSide === 'from' ? other : pinnedToken);
	const fromAmount = $derived(pinnedSide === 'from' ? pinnedAmount : otherAmount);

	/**
	 * Handle the Swap CTA. Two paths:
	 *   1. Wallet not connected → open the wallet dialog.
	 *   2. Wallet connected → navigate to the full /swap page with the
	 *      pair (and amount when present) pre-filled via query params.
	 *      The full page hosts the real FSM (quote → preview → submit);
	 *      this widget is intentionally a launcher, not a duplicate of
	 *      that flow.
	 */
	function onSwapClick(): void {
		if (!wallet.isConnected) {
			walletDialog.open('connect');
			return;
		}
		const params = new URLSearchParams();
		params.set('from', fromToken.symbol);
		params.set('to', toToken.symbol);
		const trimmed = fromAmount.trim();
		if (trimmed.length > 0 && Number(trimmed) > 0) {
			params.set('amount', trimmed);
		}
		void goto(`/swap?${params.toString()}`);
	}

	// Settings panel
	const SLIPPAGE_PRESETS = [0.1, 0.5, 1] as const;
	let isSettingsOpen = $state(false);
	let slippagePreset = $state<number | null>(0.5);
	let slippageCustom = $state('');

	function toggleSettings() {
		isSettingsOpen = !isSettingsOpen;
	}
	function pickSlippage(p: number) {
		slippagePreset = p;
		slippageCustom = '';
	}
	function onCustomInput(v: string) {
		slippageCustom = v;
		if (v.trim() !== '') slippagePreset = null;
	}
</script>

<aside class="quick-swap">
	<header class="qs-head">
		<h3>Quick Swap</h3>
		<button
			type="button"
			class="qs-settings"
			class:qs-settings-active={isSettingsOpen}
			aria-label="Swap settings"
			aria-expanded={isSettingsOpen}
			onclick={toggleSettings}
		>
			<Gear size={20} variant="duotone" />
		</button>
	</header>

	{#if isSettingsOpen}
		<section class="qs-slippage" aria-label="Slippage tolerance">
			<span class="qs-slippage-label">Slippage Tolerance</span>
			<div class="qs-slippage-row">
				{#each SLIPPAGE_PRESETS as p (p)}
					<button
						type="button"
						class="qs-chip"
						class:qs-chip-selected={slippagePreset === p}
						onclick={() => pickSlippage(p)}
					>
						{p}%
					</button>
				{/each}
				<label class="qs-chip qs-chip-input">
					<input
						type="text"
						inputmode="decimal"
						placeholder="0.00"
						bind:value={() => slippageCustom, (v: string) => onCustomInput(v)}
					/>
					<span>%</span>
				</label>
			</div>
		</section>
	{/if}

	{#snippet panel(side: 'pinned' | 'other', label: string)}
		{@const token = side === 'pinned' ? pinnedToken : other}
		{@const amount = side === 'pinned' ? pinnedAmount : otherAmount}
		<div class="qs-panel">
			<span class="qs-token-logo" style:background={token.bg}>
				{#if token.iconSrc}
					<img src={token.iconSrc} alt="" aria-hidden="true" />
				{:else}
					<span class="qs-token-letter">{token.iconLetter ?? token.symbol[0]}</span>
				{/if}
			</span>

			<div class="qs-amount">
				<div class="qs-label-row">
					<span class="qs-label">{label}</span>
					{#if side === 'pinned'}
						<span class="qs-symbol qs-symbol-locked">{token.symbol}</span>
					{:else}
						<button
							type="button"
							class="qs-symbol qs-symbol-trigger"
							class:qs-symbol-open={isOtherOpen}
							onclick={toggleOtherDropdown}
							aria-haspopup="listbox"
							aria-expanded={isOtherOpen}
						>
							{token.symbol}
							{#if isOtherOpen}
								<AngleUpSmall size={16} />
							{:else}
								<AngleDownSmall size={16} />
							{/if}
						</button>
					{/if}
				</div>
				<input
					class="qs-input"
					type="text"
					inputmode="decimal"
					placeholder="0.00"
					bind:value={
						() => amount,
						(v) => {
							if (side === 'pinned') pinnedAmount = v;
							else otherAmount = v;
						}
					}
				/>
			</div>
		</div>
	{/snippet}

	{#snippet dropdown()}
		<ul class="qs-dropdown" role="listbox">
			{#each otherCandidates as t (t.id)}
				<li>
					<button
						type="button"
						class="qs-option"
						class:qs-option-selected={t.id === other.id}
						role="option"
						aria-selected={t.id === other.id}
						onclick={() => pickOther(t)}
					>
						<span class="qs-option-logo" style:background={t.bg}>
							{#if t.iconSrc}
								<img src={t.iconSrc} alt="" aria-hidden="true" />
							{:else}
								<span class="qs-token-letter">{t.iconLetter ?? t.symbol[0]}</span>
							{/if}
						</span>
						<span class="qs-option-symbol">{t.symbol}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/snippet}

	{@render panel(fromSide, 'From')}

	{#if isOtherOpen && fromSide === 'other'}
		<!-- Trigger is the From-side: dropdown anchors directly under it,
		     hiding flip/To-card/CTA. -->
		{@render dropdown()}
	{:else}
		<div class="qs-flip" aria-hidden="false">
			<button type="button" class="qs-flip-btn" aria-label="Flip swap direction" onclick={flip}>
				<span class="qs-flip-outer"></span>
				<span class="qs-flip-inner"></span>
				<span class="qs-flip-icon"><ArrowUpDownSimple size={16} /></span>
			</button>
		</div>

		{@render panel(toSide, 'To')}

		{#if isOtherOpen && toSide === 'other'}
			<!-- Trigger is the To-side: dropdown anchors under To-card,
			     hiding only the CTA. -->
			{@render dropdown()}
		{:else}
			<button
				type="button"
				class="qs-cta"
				onclick={onSwapClick}
			>
				{wallet.isConnected ? 'Swap' : 'Connect Wallet'}
			</button>
		{/if}
	{/if}
</aside>

<style>
	.quick-swap {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		background-color: var(--color-surface-inset);
		border-radius: 24px;
	}
	.qs-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.qs-head h3 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.qs-settings {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background-color: var(--color-bg);
		border: 0;
		border-radius: 16px;
		color: var(--color-text);
		opacity: 0.7;
		cursor: pointer;
		transition:
			opacity var(--motion-base) var(--ease-out),
			background-color var(--motion-base) var(--ease-out);
	}
	.qs-settings:hover {
		opacity: 1;
	}
	.qs-settings-active {
		background-color: var(--color-text);
		color: var(--color-text-inverse);
		opacity: 1;
	}

	/* Slippage settings panel — collapsed by default, opens above the from-card. */
	.qs-slippage {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 14px 14px;
		background-color: var(--color-bg);
		border-radius: 20px;
	}
	.qs-slippage-label {
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 500;
		line-height: 1.4;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}
	.qs-slippage-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.qs-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 34px;
		padding: 7px 10px;
		background-color: var(--color-surface-inset);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 500;
		line-height: 1.4;
		letter-spacing: -0.6px;
		color: var(--color-text);
		cursor: pointer;
		transition:
			background-color var(--motion-base) var(--ease-out),
			color var(--motion-base) var(--ease-out);
	}
	.qs-chip:hover {
		background-color: rgba(255, 255, 255, 0.06);
	}
	.qs-chip-selected {
		background-color: var(--color-text);
		color: var(--color-text-inverse);
		border-color: transparent;
	}
	.qs-chip-selected:hover {
		background-color: var(--color-text);
	}
	.qs-chip-input {
		flex: 1;
		min-width: 96px;
		gap: 2px;
		cursor: text;
	}
	.qs-chip-input input {
		flex: 1;
		min-width: 0;
		width: 100%;
		background: transparent;
		border: 0;
		padding: 0;
		font: inherit;
		color: var(--color-text);
		text-align: left;
		outline: none;
	}
	.qs-chip-input input::placeholder {
		color: var(--color-text-muted);
	}
	.qs-chip-input span {
		color: var(--color-text-muted);
	}

	/* Panel: dark outer with logo on the left and a lighter inset on the right. */
	.qs-panel {
		position: relative;
		z-index: 1;
		display: flex;
		flex: none;
		align-items: center;
		gap: 8px;
		padding: 4px;
		padding-left: 12px;
		background-color: var(--color-bg);
		border-radius: 20px;
	}
	.qs-token-logo {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 16px;
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 16px;
		color: #fff;
		overflow: hidden;
	}
	.qs-token-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.qs-amount {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0;
		min-width: 0;
		padding: 4px 12px;
		background-color: var(--color-surface-inset);
		border-radius: 16px;
		min-height: 56px;
		justify-content: center;
	}
	.qs-label-row {
		display: flex;
		align-items: center;
		gap: 2px;
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		line-height: 1.4;
		letter-spacing: -0.6px;
	}
	.qs-label {
		color: var(--color-text-muted);
		font-weight: 500;
	}
	.qs-symbol {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.6px;
		color: var(--color-text);
		background: transparent;
		border: 0;
		padding: 0;
	}
	.qs-symbol-trigger {
		cursor: pointer;
	}
	.qs-symbol-locked {
		cursor: default;
	}
	.qs-input {
		background: transparent;
		border: 0;
		padding: 0;
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 500;
		line-height: 1.4;
		letter-spacing: -0.6px;
		color: var(--color-text);
		text-align: left;
		min-width: 0;
		width: 100%;
		outline: none;
	}
	.qs-input::placeholder {
		color: var(--color-text-muted);
	}

	/* Open-trigger affordances on the panel header */
	.qs-symbol-open,
	.qs-symbol-open :global(svg) {
		color: var(--color-blue-500);
	}

	/* Dropdown — overlaps the bottom half of the trigger card (input area) so
	   only the label-row with the chevron stays visible above. */
	.qs-dropdown {
		position: relative;
		z-index: 2;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: -18px 0 0;
		padding: 4px;
		list-style: none;
		max-height: 280px;
		overflow-y: auto;
		overflow-x: hidden;
		mask-image: linear-gradient(180deg, #000 0%, #000 78%, transparent 100%);
		-webkit-mask-image: linear-gradient(180deg, #000 0%, #000 78%, transparent 100%);
		/* Custom scrollbar to match the Figma slate thumb */
		scrollbar-width: thin;
		scrollbar-color: rgba(64, 71, 96, 0.6) transparent;
	}
	.qs-dropdown::-webkit-scrollbar {
		width: 6px;
	}
	.qs-dropdown::-webkit-scrollbar-track {
		background: transparent;
	}
	.qs-dropdown::-webkit-scrollbar-thumb {
		background-color: rgba(64, 71, 96, 0.6);
		border-radius: 12px;
	}
	.qs-option {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		height: 56px;
		padding: 12px;
		background-color: var(--color-surface);
		border: 1px solid transparent;
		border-radius: 20px;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
		cursor: pointer;
		text-align: left;
		transition:
			border-color var(--motion-base) var(--ease-out),
			box-shadow var(--motion-base) var(--ease-out);
	}
	.qs-option:hover:not(.qs-option-selected) {
		border-color: rgba(255, 255, 255, 0.08);
	}
	.qs-option-selected {
		background-color: var(--color-surface-inset);
		border-color: var(--color-blue-500);
		box-shadow: 0 0 8px rgba(110, 151, 255, 0.8);
	}
	.qs-option-logo {
		display: inline-flex;
		flex: none;
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
	.qs-option-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.qs-option-symbol {
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.6px;
	}

	/* Flip button — nested rotated diamonds with arrow icon centred. */
	.qs-flip {
		position: relative;
		display: flex;
		justify-content: center;
		margin: -18px 0;
		z-index: 3;
	}
	.qs-flip-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background: transparent;
		border: 0;
		padding: 0;
		color: var(--color-text);
		cursor: pointer;
	}
	.qs-flip-outer,
	.qs-flip-inner {
		position: absolute;
		top: 50%;
		left: 50%;
		pointer-events: none;
	}
	.qs-flip-outer {
		width: 36px;
		height: 36px;
		margin: -18px 0 0 -18px;
		background-color: var(--color-bg);
		border-radius: 12px;
		transform: rotate(45deg);
	}
	.qs-flip-inner {
		width: 24px;
		height: 24px;
		margin: -12px 0 0 -12px;
		background-color: var(--color-surface-inset);
		border-radius: 8px;
		transform: rotate(45deg);
	}
	.qs-flip-icon {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.qs-cta {
		margin-top: 4px;
		padding: 14px 24px;
		background-color: var(--color-text);
		color: var(--color-text-inverse);
		border: 0;
		border-radius: 20px;
		font-family: var(--font-sans);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.6px;
		text-transform: uppercase;
		cursor: pointer;
		transition: opacity var(--motion-base) var(--ease-out);
	}
	.qs-cta:hover {
		opacity: 0.9;
	}
</style>
