import { Connection } from '@solana/web3.js';

/**
 * Read-only `Connection` for the given RPC URL — websocket disabled.
 *
 * Use for one-shot reads (`getAccountInfo`, `getProgramAccounts`, `getSlot`,
 * etc.) where we don't need live updates.
 *
 * - `commitment: 'confirmed'` — matches the SDK & dashboard convention. We
 *   don't need finalized for UX-side reads; finalized adds ~12s round trips.
 * - `wsEndpoint: false as unknown as string` — disable the websocket entirely.
 *   No idle WS connection means no surprise reconnects, less console noise,
 *   and survives corporate proxies that block ws upgrades. The cast is a
 *   known web3.js typing hole — `wsEndpoint` is typed as `string`, but the
 *   runtime accepts `false`.
 * - `confirmTransactionInitialTimeout: 120_000` — give txs up to 2 minutes
 *   before bailing. Solana's default 60s is occasionally too tight under
 *   congestion (and harmless when traffic is light).
 */
export function createConnection(rpcUrl: string): Connection {
	return new Connection(rpcUrl, {
		commitment: 'confirmed',
		wsEndpoint: false as unknown as string,
		confirmTransactionInitialTimeout: 120_000
	});
}

/**
 * Subscription-capable `Connection` — websocket enabled (default endpoint
 * derived from `rpcUrl` by web3.js).
 *
 * Use for `onAccountChange`, `onLogs`, `onSlotChange`, etc. — the live-update
 * path. Phase 6 portfolio reactivity uses this; one-shot reads should keep
 * using `createConnection` to avoid an idle WS per page.
 *
 * Same commitment / timeout choices as `createConnection`; the only
 * difference is leaving `wsEndpoint` unset so web3.js infers it from the
 * RPC URL (e.g. `https://...` → `wss://...`).
 */
export function createWsConnection(rpcUrl: string): Connection {
	return new Connection(rpcUrl, {
		commitment: 'confirmed',
		// wsEndpoint omitted — web3.js derives ws endpoint from rpcUrl.
		confirmTransactionInitialTimeout: 120_000
	});
}
