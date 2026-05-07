/*
 * Phase 8 swap module — public surface.
 *
 * Three runes singletons (quote, swap FSM, balances) plus a static pool
 * catalogue. Page code imports from here exclusively; reach into the
 * `*.svelte.ts` files directly only inside the swap module's own tests.
 */
export {
	canonicalMintOrder,
	getPoolEntry,
	KNOWN_POOLS_BY_CLUSTER,
	type PoolEntry
} from './pool-catalogue';
export { quote } from './quote.svelte';
export { swap, type SwapIntent, type SwapAttempt, type SwapPhase } from './swap.svelte';
export { userBalances } from './balances.svelte';
