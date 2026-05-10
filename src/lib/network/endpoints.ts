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
		// Bootstrap-init.ts on the Areal-hosted Testnet validator created
		// fresh test mints under the deployer's keypair. After Path B
		// (R20-redeploy of contracts pinned to these mints, see
		// `scripts/migrate-mints.sh` run on 2026-05-10), the on-chain
		// programs accept these as the canonical RWT/USDC pair. The SDK's
		// default `RWT_MINTS.localnet` / `USDC_MINTS.localnet` point at
		// the original R20 placeholders, so the markets-snapshot reads
		// would land on empty accounts and every price / TVL / market
		// cap would surface as `—`. We set:
		//   - `usdcMint` to the existing test USDC (replaces the
		//     `USDC_MINTS.localnet` lookup wherever the markets layer
		//     consumes `network.endpoint.usdcMint`).
		//   - `rwtMint` as the optional override threaded through to
		//     the SDK snapshot opts (no equivalent default field on
		//     `NetworkEndpoint`).
		// Drop both when the validator is rebuilt with the SDK's
		// canonical R20 pins.
		usdcMint: new PublicKey('F9NVj8dFsqxbCfytfmrEWDjdDhmpV1YrjRuxiusGr9Ys'),
		rwtMint: new PublicKey('3pBtHBiBwh4agqghTYuDQnZV1po5YahbaBGywtiZooRr')
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
