/*
 * Test-only reactive stub for `network.svelte`.
 *
 * Mirrors the pattern in `lib/portfolio/test-helpers.svelte.ts`: `$state()`
 * only works in `.svelte.ts`/`.svelte` files compiled by vite-plugin-svelte,
 * so the reactive backing lives here and the test imports + mutates these
 * values to drive the realtime client's cluster-watch effect.
 */

export interface MockNetworkState {
	current: 'localnet' | 'devnet' | 'mainnet';
}

export const mockNetworkState: MockNetworkState = $state({
	current: 'devnet'
});

export interface MockAuthState {
	accessToken: string | null;
	wallet: string | null;
}

export const mockAuthState: MockAuthState = $state({
	accessToken: null,
	wallet: null
});

export function resetMockState() {
	mockNetworkState.current = 'devnet';
	mockAuthState.accessToken = null;
	mockAuthState.wallet = null;
}
