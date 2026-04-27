<script lang="ts">
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import { Button, toast } from '$lib/components/ui';
	import {
		AngleDownSmall,
		AngleUpSmall,
		ArrowUpDownSimple,
		Gear,
		Check,
		ThumbsUp,
		Clock,
		Bolt
	} from '$lib/icons';

	type Token = {
		id: string;
		symbol: string;
		bg: string;
		iconSrc?: string;
		iconLetter?: string;
	};

	const TOKENS: Token[] = [
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

	type Side = 'from' | 'to';

	let fromToken = $state<Token>(TOKENS[0]);
	let toToken = $state<Token>(TOKENS[1]);
	let fromAmount = $state('');
	let toAmount = $state('');
	let openSide = $state<Side | null>(null);

	function pickToken(side: Side, token: Token) {
		if (side === 'from') fromToken = token;
		else toToken = token;
		openSide = null;
	}

	function toggleDropdown(side: Side, e: MouseEvent) {
		e.stopPropagation();
		openSide = openSide === side ? null : side;
	}

	function flipSides() {
		[fromToken, toToken] = [toToken, fromToken];
		[fromAmount, toAmount] = [toAmount, fromAmount];
	}

	// Click anywhere outside the open dropdown closes it.
	$effect(() => {
		if (!openSide) return;
		const close = () => {
			openSide = null;
		};
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	const features = [
		{ icon: Check, label: 'Best rates across all liquidity pools' },
		{ icon: ThumbsUp, label: 'Low 0.5% trading fee' },
		{ icon: Bolt, label: 'Instant swaps on Solana blockchain' },
		{ icon: Clock, label: 'No registration or KYC required' }
	];
</script>

<svelte:head>
	<title>Swap · Areal</title>
	<meta name="description" content="Exchange tokens at the best rates on Solana." />
</svelte:head>

{#snippet tokenLogo(token: Token, size: 'sm' | 'lg')}
	<span class="swap-token-logo swap-token-logo-{size}" style:background={token.bg}>
		{#if token.iconSrc}
			<img src={token.iconSrc} alt="" aria-hidden="true" />
		{:else}
			<span class="swap-token-mark">{token.iconLetter ?? token.symbol[0]}</span>
		{/if}
	</span>
{/snippet}

<AppShell currentPath="/swap">
	<div class="swap-page">
		<h1 class="swap-headline">Exchange tokens at the best rates</h1>

		<section class="swap-card" aria-labelledby="swap-card-title">
			<header class="swap-card-head">
				<h2 id="swap-card-title" class="swap-card-title">Swap tokens</h2>
				<button class="swap-settings" type="button" aria-label="Swap settings">
					<Gear size={16} variant="duotone" />
				</button>
			</header>

			<div class="swap-stack">
				{#each [{ side: 'from', label: 'From', token: fromToken, amount: fromAmount }, { side: 'to', label: 'To', token: toToken, amount: toAmount }] as row (row.side)}
					{@const isOpen = openSide === row.side}
					<div class="swap-row" class:is-open={isOpen}>
						<button
							type="button"
							class="swap-token-chip"
							class:is-open={isOpen}
							onclick={(e) => toggleDropdown(row.side as Side, e)}
							aria-haspopup="listbox"
							aria-expanded={isOpen}
						>
							{@render tokenLogo(row.token, 'sm')}
							<span class="swap-token-meta">
								<span class="swap-token-side">{row.label}</span>
								<span class="swap-token-symbol">{row.token.symbol}</span>
							</span>
							{#if isOpen}
								<AngleUpSmall size={16} />
							{:else}
								<AngleDownSmall size={16} />
							{/if}
						</button>

						{#if row.side === 'from'}
							<input
								class="swap-amount"
								type="text"
								inputmode="decimal"
								placeholder="0.00"
								bind:value={fromAmount}
								aria-label="Amount to swap from"
							/>
						{:else}
							<input
								class="swap-amount"
								type="text"
								inputmode="decimal"
								placeholder="0.00"
								bind:value={toAmount}
								aria-label="Amount to receive"
							/>
						{/if}

						{#if isOpen}
							<div
								class="swap-dropdown"
								role="listbox"
								tabindex="-1"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => {
									if (e.key === 'Escape') openSide = null;
								}}
							>
								{#each TOKENS as token (token.id)}
									{@const isSelected = row.token.id === token.id}
									<button
										type="button"
										class="swap-option"
										class:is-selected={isSelected}
										role="option"
										aria-selected={isSelected}
										onclick={() => pickToken(row.side as Side, token)}
									>
										{@render tokenLogo(token, 'lg')}
										<span class="swap-option-symbol">{token.symbol}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				<button class="swap-toggle" type="button" aria-label="Swap from and to" onclick={flipSides}>
					<span class="swap-toggle-outer" aria-hidden="true"></span>
					<span class="swap-toggle-inner" aria-hidden="true"></span>
					<span class="swap-toggle-icon">
						<ArrowUpDownSimple size={16} />
					</span>
				</button>
			</div>

			<Button variant="inverse" full onclick={() => toast.info('Wallet connect — TBD')}>
				Connect Wallet
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

<style>
	.swap-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-6);
		padding: var(--space-8) var(--space-4);
	}

	/* Hero headline. Halvar Bold 24, uppercase, max width keeps the line break
	 * Figma intends ("Exchange tokens at the / best rates"). */
	.swap-headline {
		margin: 0 0 var(--space-2);
		max-width: 371px;
		font-family: var(--font-sans);
		font-size: var(--text-xl); /* 24 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-snug); /* 1.2 */
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		text-align: center;
	}

	/* ---------- Swap card ---------- */
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

	.swap-settings {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-bg);
		color: var(--color-text);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.swap-settings:hover {
		background-color: var(--color-dark-700);
	}

	/* From / To row container — bg one shade darker than the card so it nests. */
	.swap-row {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		background-color: var(--color-bg);
		border-radius: var(--radius-lg);
	}
	.swap-row.is-open {
		z-index: 10;
	}

	.swap-token-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background-color: var(--color-surface-inset);
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

	.swap-token-logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		overflow: hidden;
	}
	.swap-token-logo-sm {
		width: 32px;
		height: 32px;
		border-radius: 12px;
	}
	.swap-token-logo-lg {
		width: 40px;
		height: 40px;
		border-radius: 14px;
	}
	.swap-token-logo img {
		width: 60%;
		height: 60%;
		object-fit: contain;
	}
	.swap-token-mark {
		font-family: var(--font-sans);
		font-size: 16px;
		font-weight: var(--font-weight-bold);
		color: var(--color-white-900);
		line-height: 1;
	}
	.swap-token-logo-lg .swap-token-mark {
		font-size: 20px;
	}

	.swap-token-meta {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.2;
	}
	.swap-token-side {
		font-family: 'Onest', var(--font-body);
		font-size: 11px;
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}
	.swap-token-symbol {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.swap-amount {
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

	/* Token picker dropdown — opens from the From/To row, lists all available
	 * tokens. Each option pads its row and shows a purple glow when selected. */
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
			border-color var(--motion-base) var(--ease-out),
			box-shadow var(--motion-base) var(--ease-out);
	}
	.swap-option:hover {
		background-color: var(--color-dark-700);
	}
	.swap-option.is-selected {
		border-color: var(--color-purple-300);
		box-shadow:
			0 0 0 4px rgba(165, 110, 255, 0.2),
			0 0 16px rgba(165, 110, 255, 0.5);
	}

	.swap-option-symbol {
		font-family: var(--font-sans);
		font-size: var(--text-lg); /* 18 */
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	/* Wraps the From row + To row so the swap toggle can absolutely-position
	 * itself at the centre of the stack regardless of row content height. */
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

	/* ---------- Why use our DEX? card ---------- */
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
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3);
	}

	.dex-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.dex-item-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
