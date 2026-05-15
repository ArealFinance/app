<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { PublicKey } from '@solana/web3.js';
	import SwapConfirmModal from './SwapConfirmModal.svelte';
	import type { SwapAttempt, SwapIntent } from '$lib/swap';

	const FAKE_USDC = new PublicKey('11111111111111111111111111111114');
	const FAKE_RWT = new PublicKey('1111111111111111111111111111111B');
	const FAKE_POOL = new PublicKey('11111111111111111111111111111115');
	const FAKE_DEX_CONFIG = new PublicKey('11111111111111111111111111111116');

	const FAKE_SIG =
		'5HiD6dQ7nYr1QBmYZ4PTxxKgTcQ1nQjEaXkPbdghKzHb9eZeJYV8VTGoT7XTnRZSj4xkj4VV6Vbn';

	// Fixtures live in module scope (not args) — Storybook's args serializer
	// chokes on bigint, mirroring the ClaimConfirmModal stories pattern.
	const fakeIntent: SwapIntent = {
		poolEntry: {
			label: 'USDC / RWT',
			mintA: FAKE_USDC,
			mintB: FAKE_RWT,
			symbolA: 'USDC',
			symbolB: 'RWT',
			decimalsA: 6,
			decimalsB: 6,
			poolPda: FAKE_POOL,
			dexConfigPda: FAKE_DEX_CONFIG
		},
		fromMint: FAKE_USDC,
		toMint: FAKE_RWT,
		aToB: true,
		amountIn: 100_000_000n,
		minAmountOut: 99_500_000n,
		expectedOut: 99_750_000n,
		fees: { feeTotal: 250_000n, feeLp: 200_000n, feeProtocol: 50_000n, feeOtTreasury: 0n },
		priceImpactBps: 25,
		slippageBps: 50,
		// USDC → RWT (buy-RWT branch): fees come off output, debit == amountIn.
		userTotalDebit: 100_000_000n
	};

	// Mirror fakeIntent but on the sell-RWT branch (RWT → USDC). The wallet
	// is debited `amountIn + fees` here so the modal renders the "swap + fee"
	// sub-line.
	const fakeIntentSellRwt: SwapIntent = {
		...fakeIntent,
		fromMint: FAKE_RWT,
		toMint: FAKE_USDC,
		aToB: false,
		// Sell-RWT debits amountIn + feeTotal + feeOtTreasury from the wallet.
		userTotalDebit: 100_000_000n + 250_000n
	};

	const slippageExceededIntent: SwapIntent = {
		...fakeIntent,
		expectedOut: 99_750_000n,
		minAmountOut: 99_500_000n,
		priceImpactBps: 250
	};

	function attempt(phase: SwapAttempt['phase'], extras: Partial<SwapAttempt> = {}): SwapAttempt {
		return {
			poolBase58: FAKE_POOL.toBase58(),
			intent: fakeIntent,
			phase,
			signature: null,
			error: null,
			startedAt: Date.now(),
			...extras
		};
	}

	const noop = () => {};

	const { Story } = defineMeta({
		title: 'Sections/SwapConfirmModal',
		component: SwapConfirmModal,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<!--
	One story per FSM state plus the high-impact pre-confirm variant.
	Slots over args so bigint values don't choke the docgen pass.
-->

<Story name="IdlePreConfirm">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={null}
	/>
</Story>

<Story name="IdlePreConfirmSellRwt">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntentSellRwt}
		attempt={null}
	/>
</Story>

<Story name="IdleHighPriceImpact">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={slippageExceededIntent}
		attempt={null}
	/>
</Story>

<Story name="Preparing">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('preparing')}
	/>
</Story>

<Story name="AwaitingSignature">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('awaiting-signature')}
	/>
</Story>

<Story name="Broadcasting">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('broadcasting', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="Confirming">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('confirming', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="Success">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('success', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="ErrorState">
	<SwapConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('error', {
			error: 'Price moved during the swap, try increasing slippage tolerance.'
		})}
	/>
</Story>
