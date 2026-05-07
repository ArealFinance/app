<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MintConfirmModal from './MintConfirmModal.svelte';
	import type { MintAttempt, MintIntent } from '$lib/mint';

	const FAKE_SIG =
		'5HiD6dQ7nYr1QBmYZ4PTxxKgTcQ1nQjEaXkPbdghKzHb9eZeJYV8VTGoT7XTnRZSj4xkj4VV6Vbn';

	// Fixtures live in module scope (not args) — Storybook's args serializer
	// chokes on bigint, mirroring the SwapConfirmModal stories pattern.
	const fakeIntent: MintIntent = {
		amountIn: 100_000_000n, // 100 USDC
		minRwtOut: 99_500_000n, // 99.5 RWT (0.5% slip)
		expectedRwt: 99_750_000n, // 99.75 RWT
		navAtQuote: 1_002_500n, // $1.0025 NAV
		fees: {
			feeTotal: 250_000n,
			feeDao: 100_000n,
			feeVault: 150_000n,
			netDeposit: 99_750_000n
		},
		slippageBps: 50
	};

	function attempt(phase: MintAttempt['phase'], extras: Partial<MintAttempt> = {}): MintAttempt {
		return {
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
		title: 'Sections/MintConfirmModal',
		component: MintConfirmModal,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<!--
	One story per FSM state plus the high-impact pre-confirm variant.
	Slots over args so bigint values don't choke the docgen pass.
-->

<Story name="IdlePreConfirm">
	<MintConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={null}
	/>
</Story>

<Story name="Preparing">
	<MintConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('preparing')}
	/>
</Story>

<Story name="AwaitingSignature">
	<MintConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('awaiting-signature')}
	/>
</Story>

<Story name="Broadcasting">
	<MintConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('broadcasting', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="Confirming">
	<MintConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('confirming', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="Success">
	<MintConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('success', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="ErrorState">
	<MintConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		intent={fakeIntent}
		attempt={attempt('error', {
			error: 'NAV moved during the mint, try increasing slippage tolerance.'
		})}
	/>
</Story>
