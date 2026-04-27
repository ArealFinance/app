/*
 * Wallet store — mock-first.
 *
 * Real Phantom/Solflare adapter integration lives off this same API later.
 * Transactions come from our backend (which talks to Solana RPC); for now
 * they're a static fixture.
 */

import { truncateAddress } from '$lib/utils/address';

export type WalletStatus = 'disconnected' | 'awaiting-signature' | 'connected';
export type WalletProvider = 'phantom' | 'solflare';

export type TxType = 'add-lp' | 'swap' | 'withdraw-lp';

export type Transaction = {
	id: string;
	type: TxType;
	pair: [string, string]; // ['USDT', 'RWT']
	/** Pre-formatted amount string with sign + token (e.g. "+ 1,000.00 shares"). */
	amount: string;
	/** "11:26 AM" — pre-formatted in the bot/backend. */
	time: string;
	/** Group key for the date chip (e.g. "Apr 09, 2026"). */
	date: string;
	/** Pre-formatted USD value (e.g. "$954.54"). */
	usd: string;
};

const MOCK_ADDRESS = '41LU8sM5z2K3eXg4y7VqRb6NzTcG9HpYwJfdAaMnPp5K';

const MOCK_TRANSACTIONS: Transaction[] = [
	{ id: 't1', type: 'add-lp',     pair: ['USDT', 'RWT'], amount: '+ 1,000.00 shares', time: '11:26 AM', date: 'Apr 09, 2026', usd: '$954.54' },
	{ id: 't2', type: 'swap',       pair: ['USDT', 'RWT'], amount: '- 500.00 RWT',     time: '11:26 AM', date: 'Apr 09, 2026', usd: '$487.38' },
	{ id: 't3', type: 'withdraw-lp', pair: ['USDT', 'RWT'], amount: '- 500.00 RWT',     time: '11:26 AM', date: 'Apr 09, 2026', usd: '$487.38' },
	{ id: 't4', type: 'add-lp',     pair: ['USDT', 'RWT'], amount: '+ 1,000.00 shares', time: '11:26 AM', date: 'Apr 09, 2026', usd: '$954.54' },
	{ id: 't5', type: 'swap',       pair: ['USDT', 'RWT'], amount: '- 500.00 RWT',     time: '11:26 AM', date: 'Apr 09, 2026', usd: '$487.38' },
	{ id: 't6', type: 'withdraw-lp', pair: ['USDT', 'RWT'], amount: '- 500.00 RWT',     time: '11:26 AM', date: 'Apr 09, 2026', usd: '$487.38' }
];

type WalletState = {
	status: WalletStatus;
	address: string | null;
	provider: WalletProvider | null;
	transactions: Transaction[];
	hasMore: boolean;
};

let state = $state<WalletState>({
	status: 'disconnected',
	address: null,
	provider: null,
	transactions: [],
	hasMore: false
});

let signatureTimeout: ReturnType<typeof setTimeout> | null = null;

export const wallet = {
	get status() {
		return state.status;
	},
	get address() {
		return state.address;
	},
	get provider() {
		return state.provider;
	},
	get displayAddress() {
		return state.address ? truncateAddress(state.address, 4) : null;
	},
	get transactions() {
		return state.transactions;
	},
	get hasMore() {
		return state.hasMore;
	},
	get isConnected() {
		return state.status === 'connected';
	},

	/** Mock connect — flips through awaiting-signature into connected after a short delay. */
	connect(provider: WalletProvider = 'phantom') {
		state.status = 'awaiting-signature';
		state.provider = provider;
		if (signatureTimeout) clearTimeout(signatureTimeout);
		signatureTimeout = setTimeout(() => {
			state.address = MOCK_ADDRESS;
			state.status = 'connected';
			state.transactions = MOCK_TRANSACTIONS;
			state.hasMore = true;
			signatureTimeout = null;
		}, 1500);
	},

	disconnect() {
		if (signatureTimeout) {
			clearTimeout(signatureTimeout);
			signatureTimeout = null;
		}
		state.status = 'disconnected';
		state.address = null;
		state.provider = null;
		state.transactions = [];
		state.hasMore = false;
	},

	async copyAddress(): Promise<boolean> {
		if (!state.address || typeof navigator === 'undefined' || !navigator.clipboard) return false;
		try {
			await navigator.clipboard.writeText(state.address);
			return true;
		} catch {
			return false;
		}
	},

	/** Stub for backend pagination — appends another mock page. */
	loadMore() {
		// Future: fetch from /api/wallet/:address/transactions?cursor=...
		state.transactions = [...state.transactions, ...MOCK_TRANSACTIONS];
		state.hasMore = state.transactions.length < 24;
	}
};
