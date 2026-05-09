/*
 * Static endpoint map keyed by network id.
 *
 * Default RPC URLs come from `@areal/sdk/network` — they're sensible public
 * defaults. Production builds should override `rpcUrl` per-environment via
 * config (Helius/QuickNode/etc.) once we wire that up.
 *
 * The `localnet` slot is repurposed: instead of `127.0.0.1:8899` (which only
 * works on a developer's own machine running `solana-test-validator`), it
 * now points at the Areal-hosted test-validator exposed via Cloudflared at
 * `https://rpc.areal.finance`. The id stays `localnet` for backwards-compat
 * across the codebase; the user-facing label is "Testnet".
 */
import { PublicKey } from '@solana/web3.js';
import { PROGRAM_IDS, USDC_MINTS } from '@areal/sdk/network';

/** Public RPC URL for the Areal-hosted test-validator. */
const TESTNET_RPC_URL = 'https://rpc.areal.finance';

/*
 * In `npm run dev`, point backend + realtime URLs at the Vite dev server's
 * own origin (e.g. `http://localhost:5173`). Vite proxies `/auth`,
 * `/portfolio`, `/markets`, and `/socket.io` upstream to api.areal.finance
 * — see the `server.proxy` block in `vite.config.ts`. Same-origin in the
 * browser means no CORS preflight, which is what we want because the CF
 * Transform Rule that gates Access-Control-Allow-Origin only allows the
 * deployed hostnames (`app.areal.finance`, `panel.areal.finance`, etc.),
 * never `http://localhost:5173`.
 *
 * The `isBrowser` guard is for SvelteKit's prerender pass (build-time SSR)
 * where `window` is undefined — we fall back to the production URLs there
 * because the prerender path never actually issues these network calls,
 * but the constants still need a string value.
 */
const isDev = import.meta.env.DEV;
const isBrowser = typeof window !== 'undefined';
const devOrigin = isDev && isBrowser ? window.location.origin : null;
/** Public REST API URL of the Areal backend (Phase 12.1+ on Fornex). */
const AREAL_BACKEND_URL = devOrigin ?? 'https://api.areal.finance';
/** Realtime gateway WebSocket URL (`/realtime` is the Socket.IO namespace). */
const AREAL_REALTIME_WS_URL = devOrigin
	? `${devOrigin.replace(/^http/, 'ws')}/realtime`
	: 'wss://api.areal.finance/realtime';

export type NetworkId = 'localnet' | 'devnet' | 'mainnet';

export interface NetworkProgramIds {
	rwtEngine: PublicKey;
	nativeDex: PublicKey;
	ownershipToken: PublicKey;
	yieldDistribution: PublicKey;
	futarchy: PublicKey;
}

export interface NetworkEndpoint {
	id: NetworkId;
	label: string;
	rpcUrl: string;
	/** Public REST API base URL (auth, history, markets snapshots). */
	backendApiUrl: string;
	/** Realtime gateway WebSocket URL (Socket.IO `/realtime` namespace). */
	realtimeWsUrl: string;
	programIds: NetworkProgramIds;
	usdcMint: PublicKey;
}

export const NETWORK_IDS: NetworkId[] = ['localnet', 'devnet', 'mainnet'];

/**
 * Subset of {@link NETWORK_IDS} shown in the user-facing network switcher.
 * Mainnet is hidden until we ship the actual mainnet release — keeping it in
 * the type/endpoints map preserves cluster-specific code paths
 * (e.g. mint placeholder guards, swap pool catalogue) without exposing an
 * un-deployed cluster to end users.
 */
export const SELECTABLE_NETWORK_IDS: NetworkId[] = ['localnet', 'devnet'];

/**
 * `PROGRAM_IDS` from the SDK is a single map (program IDs are network-agnostic
 * because the same deployer publishes the same address on every cluster).
 * `USDC_MINTS` does vary per network — devnet/localnet share the devnet mint.
 */
export const ENDPOINTS: Record<NetworkId, NetworkEndpoint> = {
	localnet: {
		id: 'localnet',
		label: 'Testnet',
		rpcUrl: TESTNET_RPC_URL,
		backendApiUrl: AREAL_BACKEND_URL,
		realtimeWsUrl: AREAL_REALTIME_WS_URL,
		programIds: PROGRAM_IDS,
		usdcMint: USDC_MINTS.localnet
	},
	devnet: {
		id: 'devnet',
		label: 'Devnet',
		rpcUrl: 'https://api.devnet.solana.com',
		backendApiUrl: AREAL_BACKEND_URL,
		realtimeWsUrl: AREAL_REALTIME_WS_URL,
		programIds: PROGRAM_IDS,
		usdcMint: USDC_MINTS.devnet
	},
	mainnet: {
		id: 'mainnet',
		label: 'Mainnet',
		rpcUrl: 'https://api.mainnet-beta.solana.com',
		// Until a separate mainnet backend deployment exists, all clusters
		// share the same Areal backend host. Swap when the mainnet stack
		// goes live.
		backendApiUrl: AREAL_BACKEND_URL,
		realtimeWsUrl: AREAL_REALTIME_WS_URL,
		programIds: PROGRAM_IDS,
		usdcMint: USDC_MINTS.mainnet
	}
};
