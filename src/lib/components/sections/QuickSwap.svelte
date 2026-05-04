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
	import { AngleDownSmall, Gear, Repeat } from '$lib/icons';

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
		{ id: 'trx', symbol: 'TRX', bg: '#d84347', iconLetter: 'T' },
		{ id: 'ton', symbol: 'TON', bg: '#0098ea', iconLetter: 'T' },
		{ id: 'sprk', symbol: 'SPRK', bg: '#4265ff', iconLetter: 'S' }
	];

	let {
		pinnedToken,
		pinnedSide: initialPinnedSide = 'from',
		tokens = DEFAULT_TOKENS,
		initialOther
	}: Props = $props();

	// Local pinned-side state so the flip button can move the pinned token
	// between From and To without remounting the component.
	let pinnedSide = $state<SwapSide>(untrack(() => initialPinnedSide));
	function flip() {
		pinnedSide = pinnedSide === 'from' ? 'to' : 'from';
		[pinnedAmount, otherAmount] = [otherAmount, pinnedAmount];
	}

	const otherCandidates = $derived(tokens.filter((t) => t.id !== pinnedToken.id));
	// Initial selection captured once at mount via `untrack` (avoids the
	// "state-referenced-in-initial-value" warning). Effect below re-aligns
	// the selection if the pinned token later collides with `other`.
	let other = $state<SwapToken>(untrack(() => initialOther ?? otherCandidates[0]));
	$effect(() => {
		if (other.id === pinnedToken.id) {
			other = otherCandidates[0];
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

	// Side helpers — render the pinned side first if pinnedSide==='from', otherwise other-first.
	const fromSide = $derived(pinnedSide === 'from' ? 'pinned' : 'other');
	const toSide = $derived(pinnedSide === 'from' ? 'other' : 'pinned');
</script>

<aside class="quick-swap">
	<header class="qs-head">
		<h3>Quick Swap</h3>
		<button type="button" class="qs-settings" aria-label="Swap settings">
			<Gear size={16} />
		</button>
	</header>

	{#snippet panel(side: 'pinned' | 'other', label: string)}
		{@const token = side === 'pinned' ? pinnedToken : other}
		{@const amount = side === 'pinned' ? pinnedAmount : otherAmount}
		<div class="qs-panel">
			<button
				type="button"
				class="qs-token-chip"
				class:qs-token-chip-locked={side === 'pinned'}
				disabled={side === 'pinned'}
				onclick={(e) => side !== 'pinned' && toggleOtherDropdown(e)}
				aria-haspopup={side !== 'pinned' ? 'listbox' : undefined}
				aria-expanded={side !== 'pinned' ? isOtherOpen : undefined}
			>
				<span class="qs-token-logo" style:background={token.iconSrc ? 'transparent' : token.bg}>
					{#if token.iconSrc}
						<img src={token.iconSrc} alt="" aria-hidden="true" />
					{:else}
						<span class="qs-token-letter">{token.iconLetter ?? token.symbol[0]}</span>
					{/if}
				</span>
				{#if side !== 'pinned'}
					<AngleDownSmall size={16} />
				{/if}
			</button>

			<div class="qs-amount">
				<span class="qs-label">{label} {token.symbol}</span>
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
							<button type="button" class="qs-option" role="option" aria-selected={t.id === other.id} onclick={() => pickOther(t)}>
								<span class="qs-token-logo qs-token-logo-sm" style:background={t.iconSrc ? 'transparent' : t.bg}>
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

	<div class="qs-flip">
		<button type="button" class="qs-flip-btn" aria-label="Flip swap direction" onclick={flip}>
			<Repeat size={16} />
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
		gap: 12px;
		padding: 16px;
		background-color: var(--color-surface-inset);
		border-radius: 24px;
	}
	.qs-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
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
		width: 36px;
		height: 36px;
		background-color: var(--color-bg);
		border: 0;
		border-radius: 16px;
		color: var(--color-text);
		cursor: pointer;
	}

	.qs-panel {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 12px;
		align-items: center;
		padding: 16px;
		background-color: var(--color-bg);
		border-radius: 20px;
	}
	.qs-token-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px 6px 6px;
		background-color: var(--color-surface-inset);
		border: 0;
		border-radius: 16px;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.qs-token-chip:hover:not([disabled]) {
		background-color: rgba(255, 255, 255, 0.06);
	}
	.qs-token-chip-locked {
		cursor: default;
		opacity: 0.95;
	}
	.qs-token-logo {
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
	.qs-token-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.qs-token-logo-sm {
		width: 24px;
		height: 24px;
		border-radius: 8px;
	}

	.qs-amount {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.qs-label {
		font-family: 'Onest', var(--font-body);
		font-size: 14px;
		font-weight: 500;
		letter-spacing: -0.6px;
		color: var(--color-text-muted);
		text-align: right;
	}
	.qs-input {
		background: transparent;
		border: 0;
		padding: 0;
		font-family: 'Onest', var(--font-body);
		font-size: 20px;
		font-weight: 500;
		letter-spacing: -0.6px;
		color: var(--color-text);
		text-align: right;
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
		left: 16px;
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

	.qs-flip {
		display: flex;
		justify-content: center;
		margin: -10px 0;
	}
	.qs-flip-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		background-color: var(--color-bg);
		border: 4px solid var(--color-surface-inset);
		border-radius: 12px;
		color: var(--color-text);
		cursor: pointer;
	}

	.qs-cta {
		padding: 14px 24px;
		background-color: var(--color-text);
		color: var(--color-bg);
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
