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
	programIds: NetworkProgramIds;
	usdcMint: PublicKey;
}

export const NETWORK_IDS: NetworkId[] = ['localnet', 'devnet', 'mainnet'];

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
		programIds: PROGRAM_IDS,
		usdcMint: USDC_MINTS.localnet
	},
	devnet: {
		id: 'devnet',
		label: 'Devnet',
		rpcUrl: 'https://api.devnet.solana.com',
		programIds: PROGRAM_IDS,
		usdcMint: USDC_MINTS.devnet
	},
	mainnet: {
		id: 'mainnet',
		label: 'Mainnet',
		rpcUrl: 'https://api.mainnet-beta.solana.com',
		programIds: PROGRAM_IDS,
		usdcMint: USDC_MINTS.mainnet
	}
};
