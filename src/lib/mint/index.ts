/*
 * Phase 10 mint module — public surface.
 *
 * Three runes singletons (vault, quote, mint FSM) plus shared constants.
 * Page code imports from here exclusively; reach into the `*.svelte.ts`
 * files directly only inside the mint module's own tests.
 *
 * `userBalances` is reused 1:1 from the swap module — the swap-side store
 * already covers USDC + RWT and we don't want a second source of truth.
 */
export { MIN_MINT_AMOUNT, SLIPPAGE_DEFAULT_BPS, SLIPPAGE_MAX_BPS, SLIPPAGE_MIN_BPS } from './constants';
export { vaultStore } from './vault.svelte';
export { mintQuote } from './quote.svelte';
export { mint, type MintIntent, type MintAttempt, type MintPhase } from './mint.svelte';
export { userBalances } from '$lib/swap/balances.svelte';
