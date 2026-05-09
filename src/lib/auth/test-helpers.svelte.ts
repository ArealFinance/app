/*
 * Test-only reactive stub for `$lib/stores/wallet.svelte`. Mirrors
 * `lib/realtime/test-helpers.svelte.ts`: `$state()` only works in
 * `.svelte.ts`/`.svelte` files, so the reactive backing lives here and
 * the spec mutates these values to drive the auth store's wallet-watch
 * effect.
 */
import type { PublicKey } from '@solana/web3.js';

export interface MockWalletState {
	publicKey: PublicKey | null;
	provider: 'phantom' | 'solflare' | null;
	isConnected: boolean;
}

export const mockWalletState: MockWalletState = $state({
	publicKey: null,
	provider: null,
	isConnected: false
});

export function resetMockWalletState(): void {
	mockWalletState.publicKey = null;
	mockWalletState.provider = null;
	mockWalletState.isConnected = false;
}
