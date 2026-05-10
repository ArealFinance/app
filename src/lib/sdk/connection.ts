import { Connection } from '@solana/web3.js';

/**
 * Read-only `Connection` for the given RPC URL — websocket disabled.
 *
 * Use for one-shot reads (`getAccountInfo`, `getProgramAccounts`, `getSlot`,
 * etc.) where we don't need live updates.
 *
 * - `commitment: 'confirmed'` — matches the SDK & dashboard convention. We
 *   don't need finalized for UX-side reads; finalized adds ~12s round trips.
 * - `wsEndpoint: false` — disable the websocket subscription pump entirely.
 *   No idle WS connection means no surprise reconnects, less console noise,
 *   and survives corporate proxies that block ws upgrades. See the
 *   `@ts-expect-error` below: web3.js types `wsEndpoint` as `string`, but the
 *   constructor's runtime contract accepts `false` to skip ws setup. Saves
 *   one idle ws connection per Connection instance (we create many).
 *   Re-evaluate at every `@solana/web3.js` upgrade — F-A16 in plan/follow-ups.md.
 * - `confirmTransactionInitialTimeout: 120_000` — give txs up to 2 minutes
 *   before bailing. Solana's default 60s is occasionally too tight under
 *   congestion (and harmless when traffic is light).
 */
export function createConnection(rpcUrl: string): Connection {
	return new Connection(rpcUrl, {
		commitment: 'confirmed',
		// @ts-expect-error — web3.js types `wsEndpoint` as `string|undefined`,
		// but passing `false` is the documented runtime escape hatch to skip
		// websocket subscription setup entirely. See block comment above.
		wsEndpoint: false,
		confirmTransactionInitialTimeout: 120_000
	});
}

/**
 * Subscription-capable `Connection` — websocket enabled when an explicit
 * `wsEndpoint` is provided.
 *
 * Use for `onAccountChange`, `onLogs`, `onSlotChange`, etc. — the live-update
 * path. Phase 6 portfolio reactivity uses this; one-shot reads should keep
 * using `createConnection` to avoid an idle WS per page.
 *
 * When `wsEndpoint` is omitted (e.g. on the Areal-hosted Testnet, where the
 * Cloudflared tunnel only exposes HTTP for `rpc.areal.finance` and the
 * validator's WS port 8900 is firewalled from the public internet), we
 * pass `false` to disable web3.js's WS pump. Subscriptions registered on
 * such a Connection no-op silently — that matches the desired UX (no
 * realtime updates, but no console-spammy WS reconnect failures either).
 * Stores that depend on subscriptions (`vault.svelte.ts`) are responsible
 * for tolerating a no-op subscription gracefully.
 */
export function createWsConnection(rpcUrl: string, wsEndpoint?: string): Connection {
	if (wsEndpoint && wsEndpoint.length > 0) {
		return new Connection(rpcUrl, {
			commitment: 'confirmed',
			wsEndpoint,
			confirmTransactionInitialTimeout: 120_000
		});
	}
	return new Connection(rpcUrl, {
		commitment: 'confirmed',
		// @ts-expect-error — see `createConnection` for the `false` rationale.
		wsEndpoint: false,
		confirmTransactionInitialTimeout: 120_000
	});
}
