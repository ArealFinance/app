/*
 * Shared mint constants — single source of truth for mint-side bounds.
 *
 * Slippage bounds are re-exported from the swap module: bothering to keep
 * two separate windows for "RWT mint slippage" and "DEX swap slippage"
 * would only let them drift. The user picks one slippage tolerance per
 * action; the same UI control feeds the same store-side clamp.
 */

export {
	SLIPPAGE_DEFAULT_BPS,
	SLIPPAGE_MAX_BPS,
	SLIPPAGE_MIN_BPS
} from '$lib/swap/constants';

/**
 * Mirrors `contracts/rwt-engine/src/constants.rs::MIN_MINT_AMOUNT`.
 *
 * The on-chain handler rejects deposits below 1 USDC ($1.00 in 6-decimal
 * lamports). Surfacing the same floor in the UI lets us show a friendly
 * "Below the $1 minimum" message before submitting a tx that would revert.
 */
export const MIN_MINT_AMOUNT = 1_000_000n; // 1.00 USDC (6 decimals)
