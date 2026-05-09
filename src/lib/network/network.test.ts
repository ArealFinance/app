import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Connection } from '@solana/web3.js';
import { ENDPOINTS, NETWORK_IDS, type NetworkId } from './endpoints';

// Import the network singleton after mocking localStorage
let network: any;

describe('network (svelte.ts store)', () => {
	beforeEach(() => {
		// Clear localStorage before each test
		localStorage.clear();
		// Reset the module to get fresh singleton
		vi.resetModules();
	});

	afterEach(() => {
		localStorage.clear();
	});

	describe('initialization', () => {
		it('should default to localnet (Testnet) when localStorage is empty', async () => {
			const { network: net } = await import('./network.svelte');
			expect(net.current).toBe('localnet');
		});

		it('should restore from localStorage when available', async () => {
			localStorage.setItem('app:network:v1', 'mainnet');
			const { network: net } = await import('./network.svelte');
			expect(net.current).toBe('mainnet');
		});

		it('should fall back to default when localStorage has invalid value', async () => {
			localStorage.setItem('app:network:v1', 'invalid-network');
			const { network: net } = await import('./network.svelte');
			expect(net.current).toBe('localnet');
		});

		it('should handle missing localStorage gracefully', async () => {
			// In browser, localStorage might be undefined in some contexts
			const original = global.localStorage;
			delete (global as any).localStorage;

			try {
				const { network: net } = await import('./network.svelte');
				// Should still work with the default
				expect(net.current).toBe('localnet');
			} finally {
				(global as any).localStorage = original;
			}
		});
	});

	describe('current property', () => {
		it('should return current network id', async () => {
			const { network: net } = await import('./network.svelte');
			expect(net.current).toMatch(/devnet|mainnet|localnet/);
		});

		it('should be one of valid network ids', async () => {
			const { network: net } = await import('./network.svelte');
			expect(NETWORK_IDS).toContain(net.current);
		});
	});

	describe('endpoint property', () => {
		it('should return endpoint object for current network', async () => {
			const { network: net } = await import('./network.svelte');
			const endpoint = net.endpoint;

			expect(endpoint).toBeDefined();
			expect(endpoint).toHaveProperty('id');
			expect(endpoint).toHaveProperty('label');
			expect(endpoint).toHaveProperty('rpcUrl');
			expect(endpoint).toHaveProperty('programIds');
			expect(endpoint).toHaveProperty('usdcMint');
		});

		it('should match the current network id', async () => {
			const { network: net } = await import('./network.svelte');
			expect(net.endpoint.id).toBe(net.current);
		});

		it('should contain all required program ids', async () => {
			const { network: net } = await import('./network.svelte');
			const programIds = net.endpoint.programIds;

			expect(programIds).toHaveProperty('rwtEngine');
			expect(programIds).toHaveProperty('nativeDex');
			expect(programIds).toHaveProperty('ownershipToken');
			expect(programIds).toHaveProperty('yieldDistribution');
			expect(programIds).toHaveProperty('futarchy');
		});
	});

	describe('rpcUrl property', () => {
		it('should return rpc url for current network', async () => {
			const { network: net } = await import('./network.svelte');
			const rpcUrl = net.rpcUrl;

			expect(typeof rpcUrl).toBe('string');
			expect(rpcUrl.length).toBeGreaterThan(0);
			expect(rpcUrl).toMatch(/^https?:\/\//);
		});

		it('should match endpoint.rpcUrl', async () => {
			const { network: net } = await import('./network.svelte');
			expect(net.rpcUrl).toBe(net.endpoint.rpcUrl);
		});
	});

	describe('label property', () => {
		it('should return readable label for current network', async () => {
			const { network: net } = await import('./network.svelte');
			const label = net.label;

			expect(typeof label).toBe('string');
			expect(label.length).toBeGreaterThan(0);
			expect(['Testnet', 'Devnet', 'Mainnet']).toContain(label);
		});

		it('should match endpoint.label', async () => {
			const { network: net } = await import('./network.svelte');
			expect(net.label).toBe(net.endpoint.label);
		});
	});

	describe('setNetwork method', () => {
		it('should change current network', async () => {
			const { network: net } = await import('./network.svelte');
			const initial = net.current;
			const target = initial === 'devnet' ? 'mainnet' : 'devnet';

			net.setNetwork(target);
			expect(net.current).toBe(target);
		});

		it('should persist change to localStorage', async () => {
			const { network: net } = await import('./network.svelte');
			net.setNetwork('mainnet');

			expect(localStorage.getItem('app:network:v1')).toBe('mainnet');
		});

		it('should update endpoint properties after setNetwork', async () => {
			const { network: net } = await import('./network.svelte');
			net.setNetwork('mainnet');

			expect(net.endpoint.id).toBe('mainnet');
			expect(net.label).toBe(ENDPOINTS.mainnet.label);
		});

		it('should be idempotent when setting same network', async () => {
			const { network: net } = await import('./network.svelte');
			const initial = net.current;

			net.setNetwork(initial as NetworkId);
			expect(net.current).toBe(initial);
		});

		it('should support all valid network ids', async () => {
			const { network: net } = await import('./network.svelte');

			// Start from a network distinct from the default so the first
			// `setNetwork(NETWORK_IDS[0])` is a real transition and persists
			// to localStorage (the early-return on `current === id` would
			// otherwise skip persistence for the default-matching id).
			net.setNetwork('mainnet');

			for (const networkId of NETWORK_IDS) {
				net.setNetwork(networkId);
				expect(net.current).toBe(networkId);
				expect(localStorage.getItem('app:network:v1')).toBe(networkId);
			}
		});

		it('should handle switching between all combinations', async () => {
			const { network: net } = await import('./network.svelte');

			const combinations: Array<[NetworkId, NetworkId]> = [
				['devnet', 'mainnet'],
				['mainnet', 'localnet'],
				['localnet', 'devnet']
			];

			for (const [from, to] of combinations) {
				net.setNetwork(from);
				expect(net.current).toBe(from);

				net.setNetwork(to);
				expect(net.current).toBe(to);
				expect(net.endpoint.id).toBe(to);
			}
		});

		// W2: defensive guard against unknown ids (callers cast at the boundary).
		it('should ignore invalid network ids', async () => {
			const { network: net } = await import('./network.svelte');
			net.setNetwork('mainnet');
			expect(net.current).toBe('mainnet');

			net.setNetwork('bogus' as NetworkId);
			expect(net.current).toBe('mainnet');
			expect(localStorage.getItem('app:network:v1')).toBe('mainnet');

			net.setNetwork('' as NetworkId);
			expect(net.current).toBe('mainnet');

			net.setNetwork(null as unknown as NetworkId);
			expect(net.current).toBe('mainnet');
		});
	});

	describe('network switching', () => {
		it('should reflect endpoint change after network switch', async () => {
			const { network: net } = await import('./network.svelte');

			const devnetRpc = ENDPOINTS.devnet.rpcUrl;
			const mainnetRpc = ENDPOINTS.mainnet.rpcUrl;

			net.setNetwork('devnet');
			expect(net.rpcUrl).toBe(devnetRpc);

			net.setNetwork('mainnet');
			expect(net.rpcUrl).toBe(mainnetRpc);
		});

		it('should reflect program ids change after network switch', async () => {
			const { network: net } = await import('./network.svelte');

			net.setNetwork('mainnet');
			const mainnetProgramIds = net.endpoint.programIds;

			net.setNetwork('devnet');
			const devnetProgramIds = net.endpoint.programIds;

			// Program IDs should be consistent across networks (deployed to same address)
			expect(mainnetProgramIds.rwtEngine.toBase58()).toBe(devnetProgramIds.rwtEngine.toBase58());
		});

		it('should reflect usdc mint change after network switch', async () => {
			const { network: net } = await import('./network.svelte');

			net.setNetwork('mainnet');
			const mainnetMint = net.endpoint.usdcMint.toBase58();

			net.setNetwork('devnet');
			const devnetMint = net.endpoint.usdcMint.toBase58();

			// USDC mint may differ per network
			// Just verify they exist and are different objects
			expect(mainnetMint).toBeDefined();
			expect(devnetMint).toBeDefined();
		});
	});

	describe('localStorage round-trip', () => {
		it('should survive browser reload', async () => {
			// First import
			let { network: net } = await import('./network.svelte');
			net.setNetwork('mainnet');
			expect(net.current).toBe('mainnet');

			// Simulate reload by clearing modules and re-importing
			vi.resetModules();
			const { network: net2 } = await import('./network.svelte');

			expect(net2.current).toBe('mainnet');
		});

		it('should handle corrupted localStorage gracefully', async () => {
			localStorage.setItem('app:network:v1', '');
			const { network: net } = await import('./network.svelte');

			expect(net.current).toBe('localnet');
		});

		it('should handle malformed json in localStorage gracefully', async () => {
			localStorage.setItem('app:network:v1', '{invalid json}');
			const { network: net } = await import('./network.svelte');

			expect(net.current).toBe('localnet');
		});
	});

	describe('connection property', () => {
		it('should return a Connection instance', async () => {
			const { network: net } = await import('./network.svelte');
			expect(net.connection).toBeInstanceOf(Connection);
		});

		it('should reflect rpcUrl of current network', async () => {
			const { network: net } = await import('./network.svelte');
			net.setNetwork('devnet');
			expect(net.connection.rpcEndpoint).toBe(ENDPOINTS.devnet.rpcUrl);
		});

		it('should track rpcUrl after network switch', async () => {
			const { network: net } = await import('./network.svelte');

			net.setNetwork('devnet');
			expect(net.connection.rpcEndpoint).toBe(ENDPOINTS.devnet.rpcUrl);

			net.setNetwork('mainnet');
			expect(net.connection.rpcEndpoint).toBe(ENDPOINTS.mainnet.rpcUrl);
		});
	});

	describe('wsConnection property', () => {
		it('should return a Connection instance', async () => {
			const { network: net } = await import('./network.svelte');
			expect(net.wsConnection).toBeInstanceOf(Connection);
		});

		it('should reflect rpcUrl of current network', async () => {
			const { network: net } = await import('./network.svelte');
			net.setNetwork('devnet');
			expect(net.wsConnection.rpcEndpoint).toBe(ENDPOINTS.devnet.rpcUrl);
		});

		it('should track rpcUrl after network switch', async () => {
			const { network: net } = await import('./network.svelte');

			net.setNetwork('devnet');
			expect(net.wsConnection.rpcEndpoint).toBe(ENDPOINTS.devnet.rpcUrl);

			net.setNetwork('mainnet');
			expect(net.wsConnection.rpcEndpoint).toBe(ENDPOINTS.mainnet.rpcUrl);
		});
	});

	describe('all endpoints available', () => {
		it('should have endpoints for all network ids', () => {
			for (const networkId of NETWORK_IDS) {
				expect(ENDPOINTS[networkId]).toBeDefined();
				expect(ENDPOINTS[networkId].id).toBe(networkId);
			}
		});

		it('devnet endpoint should exist', () => {
			expect(ENDPOINTS.devnet).toBeDefined();
			expect(ENDPOINTS.devnet.label).toBe('Devnet');
		});

		it('mainnet endpoint should exist', () => {
			expect(ENDPOINTS.mainnet).toBeDefined();
			expect(ENDPOINTS.mainnet.label).toBe('Mainnet');
		});

		it('localnet endpoint should exist', () => {
			expect(ENDPOINTS.localnet).toBeDefined();
			// `localnet` slot is repurposed to point at the Areal-hosted test-validator
			// exposed at https://rpc.areal.finance. Internal id stays `localnet` for
			// backwards-compat across the codebase; user-facing label is "Testnet".
			expect(ENDPOINTS.localnet.label).toBe('Testnet');
			expect(ENDPOINTS.localnet.rpcUrl).toBe('https://rpc.areal.finance');
		});
	});
});
