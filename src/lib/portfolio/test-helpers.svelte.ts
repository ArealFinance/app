/*
 * Test-only reactive stubs.
 *
 * Mocks for `wallet.svelte`/`network.svelte` need to be reactive so that
 * mutations from a test trigger the store's `$effect`. `$state()` only works
 * in `.svelte.ts`/`.svelte` files compiled by vite-plugin-svelte, so the
 * reactive backing lives here and the test imports + mutates these values.
 */
import type { PublicKey } from '@solana/web3.js';

export interface MockWalletState {
	publicKey: PublicKey | null;
	isConnected: boolean;
}

export interface MockNetworkState {
	current: 'localnet' | 'devnet' | 'mainnet';
}

export const mockWalletState: MockWalletState = $state({
	publicKey: null,
	isConnected: false
});

export const mockNetworkState: MockNetworkState = $state({
	current: 'devnet'
});

export function resetMockState() {
	mockWalletState.publicKey = null;
	mockWalletState.isConnected = false;
	mockNetworkState.current = 'devnet';
}
