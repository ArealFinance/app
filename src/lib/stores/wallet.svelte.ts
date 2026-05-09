/*
 * Wallet store — runes-based singleton wired to the real Phantom provider.
 *
 * Public surface (kept stable for existing components):
 *   wallet.{status, address, provider, displayAddress,
 *           transactions, hasMore, isConnected,
 *           publicKey,
 *           connect(), disconnect(), copyAddress(), loadMore()}
 *
 * Note: `Connection` lives on the network store (`network.connection` /
 * `network.wsConnection`). It's a network-scoped concept and reads need to
 * work even when the wallet is disconnected — coupling it to wallet state
 * was wrong. See `src/lib/network/network.svelte.ts`.
 *
 * Transactions are intentionally empty here: the mock fixtures lived inside
 * this file in Phase 4. Phase 6+ will wire them to the backend; until then
 * we don't lie to the user with stale fixture data.
 */
import type {
	PublicKey,
	Transaction as SolanaTransaction,
	VersionedTransaction
} from '@solana/web3.js';

/*
 * `getPhantomProvider` / `getSolflareProvider` are static synchronous probes
 * over `window.{phantom,solflare}` — kilobytes, no Solana runtime. They stay
 * as static imports so the pre-flight "is wallet installed" branch can run
 * before the UI flips to `awaiting-signature`.
 *
 * `connectPhantom`, `disconnectPhantom`, `connectSolflare`, `disconnectSolflare`
 * are loaded via dynamic `import()` inside the connect/disconnect flows. The
 * provider modules themselves only carry type-only `@solana/web3.js` imports
 * (which erase at compile), but moving the runtime entry behind dynamic
 * imports keeps the wallet store off the static path to anything that ends up
 * grouped into the `vendor-solana` chunk by Rollup.
 */
import { getPhantomProvider, getSolflareProvider } from '$lib/wallet';
import { showError } from '$lib/errors';
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

let errorRevertTimeout: ReturnType<typeof setTimeout> | null = null;

function clearErrorRevert() {
	if (errorRevertTimeout) {
		clearTimeout(errorRevertTimeout);
		errorRevertTimeout = null;
	}
}

async function connect(providerName: WalletProvider = 'phantom'): Promise<void> {
	clearErrorRevert();

	// Pre-flight: surface a friendly "wallet not found" before we flip status,
	// so we never strand the UI in `awaiting-signature` for a provider that
	// isn't even installed.
	if (providerName === 'phantom' && !getPhantomProvider()) {
		showError(new Error('Phantom not found'));
		return;
	}
	if (providerName === 'solflare' && !getSolflareProvider()) {
		showError(new Error('Solflare not found'));
		return;
	}

	status = 'awaiting-signature';
	provider = providerName;
	try {
		let pk: PublicKey;
		if (providerName === 'phantom') {
			const { connectPhantom } = await import('$lib/wallet/phantom-provider');
			pk = await connectPhantom();
		} else {
			const { connectSolflare } = await import('$lib/wallet/solflare-provider');
			pk = await connectSolflare();
		}
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
	if (provider === 'solflare') {
		const { disconnectSolflare } = await import('$lib/wallet/solflare-provider');
		await disconnectSolflare();
	} else {
		// Default to Phantom for legacy / null provider — best-effort cleanup.
		const { disconnectPhantom } = await import('$lib/wallet/phantom-provider');
		await disconnectPhantom();
	}
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

/**
 * Sign and send a transaction via the active wallet provider.
 *
 * The active provider's `signAndSendTransaction` does the work — we only
 * dispatch by the currently connected provider. Both Phantom and Solflare
 * expose the same `{ signature: string }` shape, so the call site doesn't
 * need to branch.
 *
 * Throws:
 *   - `Wallet not connected` when there is no provider / no public key
 *     (status check is intentional — we won't dispatch into a stale
 *     `provider === null` setting from a half-finished disconnect).
 *   - Whatever the underlying provider throws (user rejection, RPC errors).
 *     User rejection messages are passed through unchanged so callers /
 *     `mapError` can detect "User rejected" cleanly.
 */
async function signAndSendTransaction(
	tx: SolanaTransaction | VersionedTransaction
): Promise<{ signature: string }> {
	if (status !== 'connected' || !publicKey || !provider) {
		throw new Error('Wallet not connected');
	}

	if (provider === 'phantom') {
		const p = getPhantomProvider();
		if (!p) throw new Error('Wallet not connected');
		return p.signAndSendTransaction(tx);
	}

	// provider === 'solflare'
	const p = getSolflareProvider();
	if (!p) throw new Error('Wallet not connected');
	return p.signAndSendTransaction(tx);
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

	connect,
	disconnect,
	copyAddress,
	loadMore,
	signAndSendTransaction
};
