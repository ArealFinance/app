/*
 * User wallet balance store — runes-based singleton.
 *
 * Reads the connected holder's per-mint ATA balances on demand. Used by
 * the swap form to render the From/To token chips with live numbers, and
 * refreshed after a successful swap so the chips reflect post-swap
 * balances immediately.
 *
 * Design notes:
 *   - Generic per-mint cache. USDC + RWT keep dedicated getters for
 *     backwards-compat with callers that hardcode those two tokens;
 *     `forMint(mint)` is the path going forward (e.g. SPRK and any
 *     future OT show up in the swap dropdown after we wire pool
 *     entries — the balance chip then needs a generic resolver).
 *   - One-shot reads only — no WS subscriptions. The portfolio store
 *     handles OT-side reactivity; the swap form's USDC/RWT/OT view is
 *     too narrow to justify a second subscription cycle, and the
 *     post-swap refresh closes the visual loop.
 *   - 404s on `getTokenAccountBalance` are normal (ATA not yet created)
 *     and map to `0n`.
 *   - Returns base-units bigint — caller formats via `formatTokenAmount`.
 */
import type { PublicKey } from '@solana/web3.js';
import { SvelteMap } from 'svelte/reactivity';

import { findAssociatedTokenAddressPda } from '@areal/sdk/pda';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';

const byMint = new SvelteMap<string, bigint>();

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

async function refreshMint(mint: PublicKey): Promise<void> {
	const owner = wallet.publicKey;
	if (!owner) {
		byMint.delete(mint.toBase58());
		return;
	}
	const bal = await readBalance(owner, mint);
	byMint.set(mint.toBase58(), bal);
}

async function refreshUsdc(): Promise<void> {
	await refreshMint(network.usdcMint);
}

async function refreshRwt(): Promise<void> {
	await refreshMint(network.rwtMint);
}

async function refreshAll(): Promise<void> {
	// Refresh USDC + RWT for back-compat callers, plus every mint already
	// tracked in the per-mint map so per-OT swap-form chips stay current
	// after a navigation (e.g. SPRK selected on /swap → user clicks Swap
	// → tx confirms → both SPRK and RWT balances refresh in one pass).
	const tracked = Array.from(byMint.keys());
	await Promise.all([
		refreshUsdc(),
		refreshRwt(),
		...tracked.map((b58) => {
			try {
				const mint = new (network.usdcMint.constructor as typeof PublicKey)(b58);
				return refreshMint(mint);
			} catch {
				return Promise.resolve();
			}
		})
	]);
}

function reset(): void {
	byMint.clear();
}

export const userBalances = {
	/** Convenience: USDC balance, base units, null when wallet disconnected. */
	get usdc(): bigint | null {
		const owner = wallet.publicKey;
		if (!owner) return null;
		const b = byMint.get(network.usdcMint.toBase58());
		return b ?? null;
	},
	/** Convenience: RWT balance, base units, null when wallet disconnected. */
	get rwt(): bigint | null {
		const owner = wallet.publicKey;
		if (!owner) return null;
		const b = byMint.get(network.rwtMint.toBase58());
		return b ?? null;
	},
	/**
	 * Generic lookup. Returns the cached balance for the given mint,
	 * `null` when the wallet is disconnected or the balance hasn't been
	 * fetched yet. Callers should `refreshMint(mint)` to populate.
	 */
	forMint(mint: PublicKey): bigint | null {
		const owner = wallet.publicKey;
		if (!owner) return null;
		const b = byMint.get(mint.toBase58());
		return b ?? null;
	},
	refreshUsdc,
	refreshRwt,
	refreshMint,
	refreshAll,
	reset
};
