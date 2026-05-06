/*
 * Active network store — runes-based singleton.
 *
 * Persisted to localStorage so the choice survives reloads. Default is
 * `devnet` (safest for public dev — localnet is invisible from outside the
 * dev's machine, mainnet is too production-y to default to).
 */
import { ENDPOINTS, NETWORK_IDS, type NetworkEndpoint, type NetworkId } from './endpoints';

const STORAGE_KEY = 'app:network:v1';
const DEFAULT_NETWORK: NetworkId = 'devnet';

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
	setNetwork(id: NetworkId) {
		if (current === id) return;
		current = id;
		persist(id);
	}
};
