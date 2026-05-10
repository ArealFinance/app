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
 * monkey-patch the subscription methods on the resulting Connection so they
 * resolve to a synthetic `subscriptionId === -1` and never dial WS.
 *
 * Why monkey-patching instead of `wsEndpoint: false`: web3.js 1.98 ignores
 * the `false` escape hatch — the Connection still derives `wss://…` from
 * the http URL and queues a WebSocket dial as soon as anyone subscribes.
 * Patching at the instance method level bypasses the WS pump entirely.
 *
 * Callers don't need to gate calls on a flag — `onAccountChange(...) →  -1`,
 * `removeAccountChangeListener(-1) → noop`. The pattern matches what
 * `createConnection` already does for the read-only path: a Connection
 * that quietly does the right thing rather than a separate type.
 */
const NOOP_SUBSCRIPTION_ID = -1 as number;

function neuterSubscriptions(conn: Connection): Connection {
	type SubMethods = {
		onAccountChange: Connection['onAccountChange'];
		onLogs: Connection['onLogs'];
		onSlotChange: Connection['onSlotChange'];
		onProgramAccountChange: Connection['onProgramAccountChange'];
		onSignature: Connection['onSignature'];
		onRootChange: Connection['onRootChange'];
		removeAccountChangeListener: Connection['removeAccountChangeListener'];
		removeOnLogsListener: Connection['removeOnLogsListener'];
		removeSlotChangeListener: Connection['removeSlotChangeListener'];
		removeProgramAccountChangeListener: Connection['removeProgramAccountChangeListener'];
		removeSignatureListener: Connection['removeSignatureListener'];
		removeRootChangeListener: Connection['removeRootChangeListener'];
	};
	const sub = conn as unknown as SubMethods;
	const noopRegister = () => NOOP_SUBSCRIPTION_ID;
	const noopRemove = async () => {};
	sub.onAccountChange = noopRegister as SubMethods['onAccountChange'];
	sub.onLogs = noopRegister as SubMethods['onLogs'];
	sub.onSlotChange = noopRegister as SubMethods['onSlotChange'];
	sub.onProgramAccountChange = noopRegister as SubMethods['onProgramAccountChange'];
	sub.onSignature = noopRegister as SubMethods['onSignature'];
	sub.onRootChange = noopRegister as SubMethods['onRootChange'];
	sub.removeAccountChangeListener = noopRemove as SubMethods['removeAccountChangeListener'];
	sub.removeOnLogsListener = noopRemove as SubMethods['removeOnLogsListener'];
	sub.removeSlotChangeListener = noopRemove as SubMethods['removeSlotChangeListener'];
	sub.removeProgramAccountChangeListener =
		noopRemove as SubMethods['removeProgramAccountChangeListener'];
	sub.removeSignatureListener = noopRemove as SubMethods['removeSignatureListener'];
	sub.removeRootChangeListener = noopRemove as SubMethods['removeRootChangeListener'];
	return conn;
}

export function createWsConnection(rpcUrl: string, wsEndpoint?: string): Connection {
	if (wsEndpoint && wsEndpoint.length > 0) {
		return new Connection(rpcUrl, {
			commitment: 'confirmed',
			wsEndpoint,
			confirmTransactionInitialTimeout: 120_000
		});
	}
	// No WS endpoint configured for this cluster — return a Connection whose
	// subscription methods are inert. Reads still work via the same HTTP
	// endpoint (`rpcUrl`); the WS pump is the only thing we suppress.
	const conn = new Connection(rpcUrl, {
		commitment: 'confirmed',
		confirmTransactionInitialTimeout: 120_000
	});
	return neuterSubscriptions(conn);
}
