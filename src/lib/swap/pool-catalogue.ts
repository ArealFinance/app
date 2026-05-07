/*
 * Static catalogue of pools the user-facing swap UI knows about, keyed by
 * cluster.
 *
 * Phase 8 ships only the USDC↔RWT pair on devnet/localnet. Mainnet stays
 * empty until production deployment lands (R20 placeholder mint must be
 * replaced first — `isPlaceholderRwtMint` guards the swap builder against
 * accidentally signing against the placeholder on mainnet).
 *
 * PDAs are derived once at module-load time so the page does not pay a
 * `findProgramAddressSync` cost on every render. The on-chain pool seed
 * order is `[token_a_mint, token_b_mint]` where `a < b` lexicographically;
 * we sort here at the catalogue boundary to ensure the resulting PDA matches
 * what the contract derives, regardless of the natural USDC/RWT mint order.
 */
import { PublicKey } from '@solana/web3.js';
import { findDexConfigPda, findPoolStatePda } from '@areal/sdk/pda';
import { PROGRAM_IDS, RWT_MINTS, USDC_MINTS } from '@areal/sdk/network';

import type { NetworkId } from '$lib/network/endpoints';

/** Decimals per token symbol — mirrored from on-chain mint metadata. */
const USDC_DECIMALS = 6;
const RWT_DECIMALS = 6;

export interface PoolEntry {
	/** Human-readable label (e.g. "USDC / RWT"). */
	label: string;
	/** Canonical token-A mint (`a < b` lexicographic). */
	mintA: PublicKey;
	/** Canonical token-B mint. */
	mintB: PublicKey;
	symbolA: string;
	symbolB: string;
	decimalsA: number;
	decimalsB: number;
	/** PoolState PDA — `["pool", mintA, mintB]`. */
	poolPda: PublicKey;
	/** DexConfig singleton PDA — `["dex_config"]`. */
	dexConfigPda: PublicKey;
}

/**
 * Compare two byte arrays lexicographically. Returns -1 / 0 / +1 like
 * `Buffer.compare`. Implemented inline so the catalogue doesn't depend on
 * Node's `Buffer` (which the polyfill flags in client bundles).
 */
function compareBytes(a: Uint8Array, b: Uint8Array): number {
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
	}
	if (a.length !== b.length) return a.length < b.length ? -1 : 1;
	return 0;
}

/**
 * Order two pubkeys by their underlying bytes — same convention the contract
 * uses (`mint_a < mint_b` enforced at `create_pool`). Returns the mint pair
 * in canonical order.
 */
export function canonicalMintOrder(
	a: PublicKey,
	b: PublicKey
): { mintA: PublicKey; mintB: PublicKey } {
	const cmp = compareBytes(a.toBytes(), b.toBytes());
	if (cmp === 0) {
		throw new Error('canonicalMintOrder: identical mints');
	}
	return cmp < 0 ? { mintA: a, mintB: b } : { mintA: b, mintB: a };
}

/** Build a USDC↔RWT pool entry for a given cluster. */
function buildUsdcRwtEntry(cluster: NetworkId): PoolEntry {
	const usdc = USDC_MINTS[cluster];
	const rwt = RWT_MINTS[cluster];

	const { mintA, mintB } = canonicalMintOrder(usdc, rwt);
	const usdcIsA = mintA.equals(usdc);

	const [poolPda] = findPoolStatePda(mintA, mintB, PROGRAM_IDS.nativeDex);
	const [dexConfigPda] = findDexConfigPda(PROGRAM_IDS.nativeDex);

	return {
		label: 'USDC / RWT',
		mintA,
		mintB,
		symbolA: usdcIsA ? 'USDC' : 'RWT',
		symbolB: usdcIsA ? 'RWT' : 'USDC',
		decimalsA: usdcIsA ? USDC_DECIMALS : RWT_DECIMALS,
		decimalsB: usdcIsA ? RWT_DECIMALS : USDC_DECIMALS,
		poolPda,
		dexConfigPda
	};
}

/**
 * Pools the swap UI shows per cluster.
 *
 * Mainnet intentionally empty: until R20 replaces the placeholder RWT mint,
 * a mainnet entry would point to the placeholder and any tx would revert
 * on-chain (and `buildSwapTx` would refuse to build it anyway).
 */
export const KNOWN_POOLS_BY_CLUSTER: Record<NetworkId, PoolEntry[]> = {
	localnet: [buildUsdcRwtEntry('localnet')],
	devnet: [buildUsdcRwtEntry('devnet')],
	mainnet: []
};

/**
 * Look up the pool entry that matches a `(fromMint, toMint)` pair on a given
 * cluster. The lookup is direction-agnostic — the caller resolves `aToB`
 * against the entry's canonical `mintA`. Returns `null` when no pool matches.
 */
export function getPoolEntry(
	cluster: NetworkId,
	fromMint: PublicKey,
	toMint: PublicKey
): PoolEntry | null {
	const entries = KNOWN_POOLS_BY_CLUSTER[cluster];
	for (const entry of entries) {
		const matches =
			(entry.mintA.equals(fromMint) && entry.mintB.equals(toMint)) ||
			(entry.mintA.equals(toMint) && entry.mintB.equals(fromMint));
		if (matches) return entry;
	}
	return null;
}
