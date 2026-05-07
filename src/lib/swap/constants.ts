/*
 * Shared swap constants — single source of truth for slippage bounds.
 *
 * Both the quote store (`quote.svelte.ts`) and the SwapSettings UI
 * (`SwapSettings.svelte`) clamp to the same window. Outside [0.1%, 5%]
 * the user almost certainly has a bug or is being tricked, so we silently
 * clamp rather than allow nonsense slippage like 50%.
 */

/** Minimum allowed slippage in basis points (10 bps = 0.1%). */
export const SLIPPAGE_MIN_BPS = 10;
/** Maximum allowed slippage in basis points (500 bps = 5%). */
export const SLIPPAGE_MAX_BPS = 500;
/** Default slippage on first quote load (50 bps = 0.5%). */
export const SLIPPAGE_DEFAULT_BPS = 50;
