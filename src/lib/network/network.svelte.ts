/*
 * Active network store — runes-based singleton.
 *
 * Persisted to localStorage so the choice survives reloads. Default is
 * `localnet` (which now points at the Areal-hosted test-validator at
 * `https://rpc.areal.finance` — see `endpoints.ts`). The old "localnet =
 * 127.0.0.1:8899" interpretation is gone; the Areal contracts are deployed
 * on the Areal test-validator and that's where the public app should land
 * by default. Mainnet is too production-y to default to; real Solana devnet
 * doesn't have our contracts deployed.
 *
 * Connections live here (not on the wallet store): a Connection is bound to
 * an RPC URL, which is a network-scoped concept. Reads need to work even
 * when the wallet is disconnected (e.g. landing page TVL, public market
 * data), so coupling the read path to wallet state was wrong.
 *
 * Two flavors:
 *   - `connection`   → ws disabled. Use for one-shot reads.
 *   - `wsConnection` → ws enabled. Use for `onAccountChange` / `onLogs` /
 *                       `onSlotChange` (Phase 6+ portfolio reactivity).
 *
 * Both are recreated whenever `current` changes (network switch). web3.js
 * `Connection` objects are cheap to construct, so the getter pattern is
 * fine — no need for explicit caching.
 */
import type { Connection } from '@solana/web3.js';

import { createConnection, createWsConnection } from '$lib/sdk/connection';
import { ENDPOINTS, NETWORK_IDS, type NetworkEndpoint, type NetworkId } from './endpoints';

const STORAGE_KEY = 'app:network:v1';
const DEFAULT_NETWORK: NetworkId = 'localnet';

function loadFromStorage(): NetworkId | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	if ((NETWORK_IDS as string[]).includes(raw)) return raw as NetworkId;
	return null;
}

let current: NetworkId = $state(loadFromStorage() ?? DEFAULT_NETWORK);

function persist(id: NetworkId) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, id);
}

export const network = {
	get current(): NetworkId {
		return current;
	},
	get endpoint(): NetworkEndpoint {
		return ENDPOINTS[current];
	},
	get rpcUrl(): string {
		return ENDPOINTS[current].rpcUrl;
	},
	get label(): string {
		return ENDPOINTS[current].label;
	},
	/** Read-only Connection (websocket disabled). Use for one-shot reads. */
	get connection(): Connection {
		return createConnection(ENDPOINTS[current].rpcUrl);
	},
	/** Subscription-capable Connection. Use for onAccountChange / onLogs. */
	get wsConnection(): Connection {
		const ep = ENDPOINTS[current];
		return createWsConnection(ep.rpcUrl, ep.wsRpcUrl);
	},
	setNetwork(id: NetworkId) {
		// Defensive guard: reject ids outside the known set. Callers cast at
		// the boundary (e.g. URL params, user input) so a bogus value can
		// reach this method despite the static type.
		if (!(NETWORK_IDS as readonly string[]).includes(id)) return;
		if (current === id) return;
		current = id;
		persist(id);
	}
};
