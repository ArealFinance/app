import { Connection } from '@solana/web3.js';

/**
 * Build a `Connection` for the given RPC URL.
 *
 * - `commitment: 'confirmed'` — matches the SDK & dashboard convention. We
 *   don't need finalized for UX-side reads; finalized adds ~12s round trips.
 * - `wsEndpoint: false as unknown as string` — disable the websocket entirely.
 *   We don't run real-time subscriptions yet, and the default ws upgrade is
 *   noisy in the browser console and breaks behind some corporate proxies.
 *   The cast is a known web3.js typing hole — `wsEndpoint` is typed as
 *   `string`, but the runtime accepts `false`.
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
