/*
 * User wallet balance store — runes-based singleton.
 *
 * Reads the connected holder's USDC + RWT ATA balances on demand. Used by
 * the swap form to render the From/To token chips with live numbers, and
 * refreshed after a successful swap so the chips reflect post-swap balances
 * immediately.
 *
 * Design notes:
 *   - One-shot reads only — no WS subscriptions. The portfolio store handles
 *     OT-side reactivity; the swap form's USDC/RWT view is too narrow to
 *     justify a second subscription cycle, and the post-swap refresh closes
 *     the visual loop.
 *   - 404s on `getTokenAccountBalance` are normal (ATA not yet created) and
 *     map to `0n`.
 *   - Returns base-units bigint — caller formats via `formatTokenAmount`.
 */
import type { PublicKey } from '@solana/web3.js';

import { findAssociatedTokenAddressPda } from '@areal/sdk/pda';
import { RWT_MINTS, USDC_MINTS } from '@areal/sdk/network';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';

let usdc: bigint | null = $state(null);
let rwt: bigint | null = $state(null);

async function readBalance(owner: PublicKey, mint: PublicKey): Promise<bigint> {
	const conn = network.connection;
	const [ata] = findAssociatedTokenAddressPda(owner, mint);
	try {
		const res = await conn.getTokenAccountBalance(ata);
		// `amount` is a string of base units; convert via BigInt.
		return BigInt(res.value.amount);
	} catch {
		// 404 / unknown account → treat as zero balance. The user may not
		// have an ATA yet (we'll create one as part of the swap tx).
		return 0n;
	}
}

async function refreshUsdc(): Promise<void> {
	const owner = wallet.publicKey;
	if (!owner) {
		usdc = null;
		return;
	}
	const mint = USDC_MINTS[network.current];
	usdc = await readBalance(owner, mint);
}

async function refreshRwt(): Promise<void> {
	const owner = wallet.publicKey;
	if (!owner) {
		rwt = null;
		return;
	}
	const mint = RWT_MINTS[network.current];
	rwt = await readBalance(owner, mint);
}

async function refreshAll(): Promise<void> {
	await Promise.all([refreshUsdc(), refreshRwt()]);
}

function reset(): void {
	usdc = null;
	rwt = null;
}

export const userBalances = {
	get usdc(): bigint | null {
		return usdc;
	},
	get rwt(): bigint | null {
		return rwt;
	},
	refreshUsdc,
	refreshRwt,
	refreshAll,
	reset
};
