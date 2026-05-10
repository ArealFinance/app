/*
 * Faucet module — public surface.
 *
 * Single export: the runes-based `faucet` singleton wired to
 * `POST /faucet/usdc` on the active cluster's backend. Page code imports from
 * here exclusively; reach into `faucet.svelte.ts` directly only inside this
 * module's tests.
 */
export { faucet } from './faucet.svelte';
