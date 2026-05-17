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
import { isMasterPool } from '@areal/sdk/markets';
import { PROGRAM_IDS, RWT_MINTS, USDC_MINTS } from '@areal/sdk/network';

import { ENDPOINTS, type NetworkId } from '$lib/network/endpoints';

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
	/**
	 * CP-11 — true when `(mintA, mintB)` matches a protocol master pool
	 * (Monotonic Ladder: RWT/USDC, RWT/USDY). UI gates a few branches off
	 * this flag:
	 *   - the LP add/zap form is hidden / disabled on master pools (the
	 *     contract rejects user LP with `MasterPoolUserLpDisabled`),
	 *   - the swap quote may route through `rwt_engine::mint_rwt` when the
	 *     master-pool gate fires (no organic ask above NAV × 1.005).
	 *
	 * Derived once from `isMasterPool(mintA, mintB, cluster)` so the SDK
	 * helper stays the single source of truth.
	 */
	isMasterPool: boolean;
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

/**
 * Generic OT↔RWT pool builder. Both `create-sparkles-ot.ts` and the
 * Testnet bootstrap pair every OT against RWT (the native DEX requires
 * one side to be the RWT mint via `0x1781 — Neither token is RWT_MINT`),
 * so the only varying input is the OT mint + its label + decimals.
 */
function buildOtRwtEntry(opts: {
	cluster: NetworkId;
	otMint: PublicKey;
	otSymbol: string;
	otDecimals: number;
	otLabel?: string;
}): PoolEntry {
	const ep = ENDPOINTS[opts.cluster];
	const rwt = ep.rwtMint ?? RWT_MINTS[opts.cluster];
	const { mintA, mintB } = canonicalMintOrder(opts.otMint, rwt);
	const otIsA = mintA.equals(opts.otMint);
	const [poolPda] = findPoolStatePda(mintA, mintB, PROGRAM_IDS.nativeDex);
	const [dexConfigPda] = findDexConfigPda(PROGRAM_IDS.nativeDex);
	return {
		label: opts.otLabel ?? `${opts.otSymbol} / RWT`,
		mintA,
		mintB,
		symbolA: otIsA ? opts.otSymbol : 'RWT',
		symbolB: otIsA ? 'RWT' : opts.otSymbol,
		decimalsA: otIsA ? opts.otDecimals : RWT_DECIMALS,
		decimalsB: otIsA ? RWT_DECIMALS : opts.otDecimals,
		poolPda,
		dexConfigPda,
		// OT/RWT pairs are never master pools — Monotonic Ladder is only
		// RWT/USDC and RWT/USDY. `isMasterPool` still routes through the
		// SDK helper so a future shift in the master-pool set is picked up
		// automatically.
		isMasterPool: isMasterPool(mintA, mintB, opts.cluster)
	};
}

/** SPRK mint (Sparkles OT) created by `scripts/lib/create-sparkles-ot.ts`. */
const SPRK_MINT = new PublicKey('3xWNZFsPKNmmeQHTo1HDxQK6EGutZHadnGQZBrmd8RYQ');
const SPRK_DECIMALS = 6;

/** Build a USDC↔RWT pool entry for a given cluster.
 *
 * Honours `ENDPOINTS[cluster].{usdcMint,rwtMint}` overrides (set on
 * Testnet/`localnet` to bootstrap-init.ts-created test mints). Without
 * these overrides the pool PDA would derive from the SDK-default mints
 * the Testnet validator's on-chain dex doesn't know about, and the
 * swap form would surface "no pool for this pair".
 */
function buildUsdcRwtEntry(cluster: NetworkId): PoolEntry {
	const ep = ENDPOINTS[cluster];
	const usdc = ep.usdcMint ?? USDC_MINTS[cluster];
	const rwt = ep.rwtMint ?? RWT_MINTS[cluster];

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
		dexConfigPda,
		// RWT/USDC is one of the two protocol master pools (the other is
		// RWT/USDY). Defer to the SDK helper so the mapping stays consistent
		// with the contract-side `is_master_pool` check.
		isMasterPool: isMasterPool(mintA, mintB, cluster)
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
	// Order matters — /swap defaults to `pools[0]` on mount when no
	// `?from=&to=` deep-link is present. SPRK/RWT is the only fully-
	// working Testnet pair right now (the USDC/RWT pool is concentrated
	// and the quote engine doesn't price concentrated pools yet), so it
	// goes first to give a useful out-of-the-box experience.
	localnet: [
		buildOtRwtEntry({
			cluster: 'localnet',
			otMint: SPRK_MINT,
			otSymbol: 'SPRK',
			otDecimals: SPRK_DECIMALS
		}),
		buildUsdcRwtEntry('localnet')
	],
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
