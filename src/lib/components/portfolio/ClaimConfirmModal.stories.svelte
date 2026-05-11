<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { PublicKey } from '@solana/web3.js';
	import ClaimConfirmModal from './ClaimConfirmModal.svelte';
	import type { ClaimAttempt } from '$lib/portfolio/claim.svelte';
	import type { PortfolioRow } from '@areal/sdk/portfolio';

	const FAKE_OT = new PublicKey('11111111111111111111111111111117');
	const FAKE_ATA = new PublicKey('11111111111111111111111111111114');
	const FAKE_DIST = new PublicKey('11111111111111111111111111111116');

	// Story-level fixtures. We do NOT pass these as `args` because Storybook's
	// args serializer chokes on `bigint` (TypeError: Do not know how to
	// serialize a BigInt) — the modal needs bigint values internally, so
	// stories instead instantiate the component directly inside each <Story>.
	const fakeRow: PortfolioRow = {
		otMint: FAKE_OT,
		metadata: { name: 'Sample Ownership Token', symbol: 'SAMPLE', decimals: 6 },
		balance: 1_000_000_000n,
		distributor: FAKE_DIST,
		cumulativeAmount: 12_500_000n,
		claimedAmount: 0n,
		claimableNow: 12_500_000n,
		vestingRatePerSec: 0n,
		ataAddress: FAKE_ATA
	};

	function attempt(phase: ClaimAttempt['phase'], extras: Partial<ClaimAttempt> = {}): ClaimAttempt {
		return {
			otMintBase58: FAKE_OT.toBase58(),
			phase,
			amount: 12_500_000n,
			signature: null,
			error: null,
			startedAt: Date.now(),
			...extras
		};
	}

	const FAKE_SIG =
		'5HiD6dQ7nYr1QBmYZ4PTxxKgTcQ1nQjEaXkPbdghKzHb9eZeJYV8VTGoT7XTnRZSj4xkj4VV6Vbn';

	const noop = () => {};

	const { Story } = defineMeta({
		title: 'Sections/ClaimConfirmModal',
		component: ClaimConfirmModal,
		tags: ['autodocs'],
		parameters: { layout: 'centered' }
	});
</script>

<!--
	Each story renders one of the 7 phases the modal walks through.
	Slots over args avoid the bigint-serialization error in Storybook's
	docgen pass.
-->

<Story name="IdlePreConfirm">
	<ClaimConfirmModal open={true} onclose={noop} onconfirm={noop} row={fakeRow} attempt={null} />
</Story>

<Story name="Preparing">
	<ClaimConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		row={fakeRow}
		attempt={attempt('preparing')}
	/>
</Story>

<Story name="AwaitingSignature">
	<ClaimConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		row={fakeRow}
		attempt={attempt('awaiting-signature')}
	/>
</Story>

<Story name="Broadcasting">
	<ClaimConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		row={fakeRow}
		attempt={attempt('broadcasting', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="Confirming">
	<ClaimConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		row={fakeRow}
		attempt={attempt('confirming', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="Success">
	<ClaimConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		row={fakeRow}
		attempt={attempt('success', { signature: FAKE_SIG })}
	/>
</Story>

<Story name="ErrorState">
	<ClaimConfirmModal
		open={true}
		onclose={noop}
		onconfirm={noop}
		row={fakeRow}
		attempt={attempt('error', {
			error: 'Merkle proof verification failed (InvalidProof).'
		})}
	/>
</Story>
