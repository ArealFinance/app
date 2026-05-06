/*
 * Wallet store — runes-based singleton wired to the real Phantom provider.
 *
 * Public surface (kept stable for existing components):
 *   wallet.{status, address, provider, displayAddress,
 *           transactions, hasMore, isConnected,
 *           connect(), disconnect(), copyAddress(), loadMore()}
 *
 * Added in Phase 5:
 *   wallet.publicKey   → @solana/web3.js PublicKey | null (for SDK calls)
 *   wallet.connection  → cached `Connection` for the active network
 *
 * Transactions are intentionally empty here: the mock fixtures lived inside
 * this file in Phase 4. Phase 6+ will wire them to the backend; until then
 * we don't lie to the user with stale fixture data.
 */
import type { PublicKey } from '@solana/web3.js';

import { connectPhantom, disconnectPhantom, getPhantomProvider } from '$lib/wallet';
import { network } from '$lib/network';
import { showError } from '$lib/errors';
import { createConnection } from '$lib/sdk';
import { truncateAddress } from '$lib/utils/address';

export type WalletStatus = 'disconnected' | 'awaiting-signature' | 'connected' | 'error';
export type WalletProvider = 'phantom' | 'solflare';

export type TxType = 'add-lp' | 'swap' | 'withdraw-lp';

/**
 * Transaction shape from the (future) backend pagination endpoint. Kept here
 * because UI components reference it. Will move to a service module when the
 * backend integration lands.
 */
export type Transaction = {
	id: string;
	type: TxType;
	pair: [string, string];
	amount: string;
	time: string;
	date: string;
	usd: string;
};

let status: WalletStatus = $state('disconnected');
let address: string | null = $state(null);
let publicKey: PublicKey | null = $state(null);
let provider: WalletProvider | null = $state(null);
let transactions: Transaction[] = $state([]);
let hasMore: boolean = $state(false);

// Connection follows the active network — recreated when `network.current`
// changes. `$derived.by` keeps it lazy and re-runs on dependency change.
const connection = $derived.by(() => createConnection(network.endpoint.rpcUrl));

let errorRevertTimeout: ReturnType<typeof setTimeout> | null = null;

function clearErrorRevert() {
	if (errorRevertTimeout) {
		clearTimeout(errorRevertTimeout);
		errorRevertTimeout = null;
	}
}

async function connect(providerName: WalletProvider = 'phantom'): Promise<void> {
	clearErrorRevert();

	// Solflare not wired yet — surface explicitly, don't quietly fall through.
	if (providerName !== 'phantom') {
		showError(new Error(`Provider "${providerName}" not yet supported`));
		return;
	}

	if (!getPhantomProvider()) {
		showError(new Error('Phantom not found'));
		return;
	}

	status = 'awaiting-signature';
	provider = 'phantom';
	try {
		const pk = await connectPhantom();
		publicKey = pk;
		address = pk.toBase58();
		status = 'connected';
		// Don't fabricate transactions — Phase 6+ will populate from the backend.
		transactions = [];
		hasMore = false;
	} catch (err) {
		status = 'error';
		showError(err);
		// Auto-revert to disconnected so the UI doesn't get stuck on an error
		// state with no path back to "Connect wallet".
		errorRevertTimeout = setTimeout(() => {
			status = 'disconnected';
			provider = null;
			errorRevertTimeout = null;
		}, 1500);
	}
}

async function disconnect(): Promise<void> {
	clearErrorRevert();
	await disconnectPhantom();
	publicKey = null;
	address = null;
	provider = null;
	transactions = [];
	hasMore = false;
	status = 'disconnected';
}

async function copyAddress(): Promise<boolean> {
	if (!address || typeof navigator === 'undefined' || !navigator.clipboard) return false;
	try {
		await navigator.clipboard.writeText(address);
		return true;
	} catch {
		return false;
	}
}

/** Stub for backend pagination — Phase 6+. */
function loadMore(): void {
	// no-op until the backend transaction history endpoint is wired
}

export const wallet = {
	get status() {
		return status;
	},
	get address() {
		return address;
	},
	get publicKey() {
		return publicKey;
	},
	get provider() {
		return provider;
	},
	get displayAddress() {
		return address ? truncateAddress(address, 4) : null;
	},
	get transactions() {
		return transactions;
	},
	get hasMore() {
		return hasMore;
	},
	get isConnected() {
		return status === 'connected';
	},
	get connection() {
		return connection;
	},

	connect,
	disconnect,
	copyAddress,
	loadMore
};
