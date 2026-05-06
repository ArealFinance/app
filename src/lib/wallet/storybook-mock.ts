/*
 * Fake wallet object for Storybook stories that need a connected wallet
 * without spinning up the real Phantom provider.
 *
 * Stories that exercise wallet-driven flows can import this and pass it in
 * via context, or use the `withMockWallet` decorator (see `.storybook/preview`).
 */
import type { PublicKey } from '@solana/web3.js';

export type MockWalletStatus = 'disconnected' | 'awaiting-signature' | 'connected';

export interface MockWalletApi {
	status: MockWalletStatus;
	address: string | null;
	publicKey: PublicKey | null;
	provider: 'phantom' | 'solflare' | null;
	displayAddress: string | null;
	transactions: never[];
	hasMore: boolean;
	isConnected: boolean;
	connect: () => void;
	disconnect: () => void;
	copyAddress: () => Promise<boolean>;
	loadMore: () => void;
}

const MOCK_ADDRESS = '41LU8sM5z2K3eXg4y7VqRb6NzTcG9HpYwJfdAaMnPp5K';

export function createMockWallet(initial: Partial<MockWalletApi> = {}): MockWalletApi {
	return {
		status: 'connected',
		address: MOCK_ADDRESS,
		publicKey: null,
		provider: 'phantom',
		displayAddress: '41LU…Pp5K',
		transactions: [],
		hasMore: false,
		isConnected: true,
		connect: () => {},
		disconnect: () => {},
		copyAddress: async () => true,
		loadMore: () => {},
		...initial
	};
}
