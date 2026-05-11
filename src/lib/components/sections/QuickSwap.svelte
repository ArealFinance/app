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
	import { wallet } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import { AngleDownSmall, ArrowUpDownSimple, Gear } from '$lib/icons';

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
</script>

<aside class="quick-swap">
	<header class="qs-head">
		<h3>Quick Swap</h3>
		<button type="button" class="qs-settings" aria-label="Swap settings">
			<Gear size={20} />
		</button>
	</header>

	{#snippet panel(side: 'pinned' | 'other', label: string)}
		{@const token = side === 'pinned' ? pinnedToken : other}
		{@const amount = side === 'pinned' ? pinnedAmount : otherAmount}
		<div class="qs-panel">
			<span class="qs-token-logo" style:background={token.iconSrc ? token.bg : token.bg}>
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
							onclick={toggleOtherDropdown}
							aria-haspopup="listbox"
							aria-expanded={isOtherOpen}
						>
							{token.symbol}
							<AngleDownSmall size={16} />
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

			{#if side !== 'pinned' && isOtherOpen}
				<ul class="qs-dropdown" role="listbox">
					{#each otherCandidates as t (t.id)}
						<li>
							<button
								type="button"
								class="qs-option"
								role="option"
								aria-selected={t.id === other.id}
								onclick={() => pickOther(t)}
							>
								<span
									class="qs-token-logo qs-token-logo-sm"
									style:background={t.iconSrc ? t.bg : t.bg}
								>
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
			{/if}
		</div>
	{/snippet}

	{@render panel(fromSide, 'From')}

	<div class="qs-flip" aria-hidden="false">
		<button type="button" class="qs-flip-btn" aria-label="Flip swap direction" onclick={flip}>
			<span class="qs-flip-outer"></span>
			<span class="qs-flip-inner"></span>
			<span class="qs-flip-icon"><ArrowUpDownSimple size={16} /></span>
		</button>
	</div>

	{@render panel(toSide, 'To')}

	<button
		type="button"
		class="qs-cta"
		onclick={() => (wallet.isConnected ? undefined : walletDialog.open('connect'))}
	>
		{wallet.isConnected ? 'Swap' : 'Connect Wallet'}
	</button>
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

	/* Panel: dark outer with logo on the left and a lighter inset on the right. */
	.qs-panel {
		position: relative;
		display: flex;
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
	.qs-token-logo-sm {
		width: 24px;
		height: 24px;
		border-radius: 8px;
		font-size: 12px;
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

	.qs-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 12px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 4px;
		list-style: none;
		background-color: var(--color-surface-inset);
		border-radius: 16px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		min-width: 140px;
	}
	.qs-option {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: 0;
		border-radius: 12px;
		font-family: var(--font-body);
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.6px;
		color: var(--color-text);
		cursor: pointer;
		text-align: left;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.qs-option:hover {
		background-color: rgba(255, 255, 255, 0.06);
	}
	.qs-option[aria-selected='true'] {
		background-color: rgba(255, 255, 255, 0.04);
	}

	/* Flip button — nested rotated diamonds with arrow icon centred. */
	.qs-flip {
		position: relative;
		display: flex;
		justify-content: center;
		margin: -18px 0;
		z-index: 1;
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
