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
import { RWT_MINTS, USDC_MINTS, getProgramIds } from '@areal/sdk/network';

/** Public RPC URL for the Areal-hosted test-validator. */
const TESTNET_RPC_URL = 'https://rpc.areal.finance';

/**
 * Helius devnet RPC for Areal devnet (Phase 12.1+). Carries an API key as
 * a query string — keep at the boundary of the network config since both
 * SOL JSON-RPC and the WS subscription share the same URL on Helius. Replace
 * with a private node only if Helius rate limits become an issue.
 */
const HELIUS_DEVNET_RPC_URL =
	'https://devnet.helius-rpc.com/?api-key=4e2f4597-b7dc-4258-9d59-449f4fe3a776';

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
	/**
	 * Optional explicit WebSocket endpoint for the Solana RPC (subscription
	 * connection). Devnet / mainnet leave this `undefined`, and web3.js
	 * derives `wss://...` from `rpcUrl` as usual. Testnet sets it `null`
	 * (typed `undefined` here, runtime-distinct via the WS-disabled path
	 * in `lib/sdk/connection.ts::createWsConnection`) because the
	 * Cloudflared tunnel for `rpc.areal.finance` only proxies HTTP — the
	 * validator's WS port 8900 is firewalled from the public internet, so
	 * `wss://rpc.areal.finance/` always 502s. Subscriptions on the
	 * resulting Connection no-op silently rather than fail-loop.
	 */
	wsRpcUrl?: string;
	/** Public REST API base URL (auth, history, markets snapshots). */
	backendApiUrl: string;
	/** Realtime gateway WebSocket URL (Socket.IO `/realtime` namespace). */
	realtimeWsUrl: string;
	programIds: NetworkProgramIds;
	usdcMint: PublicKey;
	/**
	 * Optional override for the RWT mint pubkey on this cluster. Defaults
	 * (`undefined`) tell the SDK to use its canonical `RWT_MINTS[cluster]`
	 * table. Set this when the on-chain RWT mint differs from the SDK's
	 * R20-pinned default — e.g. on the Areal-hosted Testnet validator
	 * where bootstrap-init.ts created a non-canonical mint because the
	 * deployer doesn't hold the canonical keypair.
	 */
	rwtMint?: PublicKey;
	/**
	 * Whether the backend exposes `/markets/tokens/<mint>/holders` for this
	 * cluster. The Areal Testnet validator's indexer doesn't ship this
	 * projection yet, so the endpoint returns 404 — and even though we
	 * catch the error in `holders-store`, the browser still logs the 404
	 * to the network panel before JS sees it. Setting this `false` makes
	 * the store skip the request entirely. Devnet/Mainnet leave it
	 * `true` (default) so the SDK call path works as soon as the backend
	 * surface is deployed there.
	 */
	holdersBackendAvailable?: boolean;
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
 * Program IDs are resolved per-cluster via `getProgramIds(cluster)` — devnet
 * has its own vanity-key bundle (M4 cluster-aware fix in SDK 0.13.2). Mainnet
 * + localnet still share the same set (localnet uses mainnet pubkeys today
 * because the test-validator deploys the same keypairs), but we keep the
 * `getProgramIds(...)` call at each site so a future localnet rebuild with
 * distinct pubkeys won't require chasing this file down again.
 * `USDC_MINTS` does vary per network — devnet/localnet share the devnet mint.
 */
export const ENDPOINTS: Record<NetworkId, NetworkEndpoint> = {
	localnet: {
		id: 'localnet',
		label: 'Testnet',
		rpcUrl: TESTNET_RPC_URL,
		backendApiUrl: AREAL_BACKEND_URL,
		realtimeWsUrl: AREAL_REALTIME_WS_URL,
		programIds: getProgramIds('localnet'),
		// Pull canonical Testnet mint pubkeys from SDK 0.12.4+:
		//   - `USDC_MINTS.localnet`  — test USDC mint on the Areal VPS validator
		//   - `RWT_MINTS.localnet`   — RWT mint pinned via R20 migrate-mints
		// Both are re-synced via `scripts/sync-sdk-localnet-mints.sh` whenever
		// the VPS validator state resets, so we keep ONE source of truth (SDK)
		// instead of duplicating literals here. Earlier hardcoded values
		// (`F9NVj…` / `3pBtH…`) pointed at stale mints and shadowed the SDK
		// lookup — markets-snapshot landed on empty accounts and every
		// supply / holders / price surfaced as `—`.
		usdcMint: USDC_MINTS.localnet,
		rwtMint: RWT_MINTS.localnet,
		// Backend `/markets/tokens/<mint>/holders` projection is live on
		// the Testnet validator (verified 2026-05-18 — returns count=5
		// against the current RWT mint). Enable so holdersStore polls.
		holdersBackendAvailable: true
	},
	devnet: {
		id: 'devnet',
		label: 'Devnet',
		// Helius devnet RPC — the public `api.devnet.solana.com` aggressively
		// rate-limits and silently drops subscriptions, so all Areal devnet
		// reads go through Helius. Same URL serves both HTTP JSON-RPC and the
		// WS endpoint (Helius derives the WS scheme from the HTTPS host).
		rpcUrl: HELIUS_DEVNET_RPC_URL,
		backendApiUrl: AREAL_BACKEND_URL,
		realtimeWsUrl: AREAL_REALTIME_WS_URL,
		// Devnet has its own program-ID bundle (separate vanity keypairs
		// from mainnet — see `data/devnet-addresses.json::programs`). Pull
		// via `getProgramIds('devnet')` instead of the deprecated mainnet
		// `PROGRAM_IDS` shim so the right .so addresses are resolved.
		programIds: getProgramIds('devnet'),
		// Devnet USDC + RWT come from the SDK's per-cluster mint table
		// (sdk 0.13.1+); both are real on-chain mints produced by
		// `scripts/bootstrap-init.ts` and pinned in
		// `data/devnet-addresses.json::mints`.
		usdcMint: USDC_MINTS.devnet,
		rwtMint: RWT_MINTS.devnet
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
		programIds: getProgramIds('mainnet'),
		usdcMint: USDC_MINTS.mainnet
	}
};
