import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
	getSolflareProvider,
	isSolflareInstalled,
	connectSolflare,
	disconnectSolflare,
	type SolflareProvider
} from './solflare-provider';

/*
 * Build a minimal SolflareProvider stub. The real injected object exposes more
 * methods (signMessage, etc.); we only model what the shim touches.
 */
function makeMockProvider(overrides: Partial<SolflareProvider> = {}): SolflareProvider {
	return {
		publicKey: null,
		isSolflare: true,
		isConnected: false,
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		signTransaction: vi.fn(),
		signAndSendTransaction: vi.fn(),
		on: vi.fn(),
		off: vi.fn(),
		...overrides
	};
}

describe('solflare-provider', () => {
	let originalWindow: unknown;

	beforeEach(() => {
		originalWindow = (globalThis as { window?: unknown }).window;
		(globalThis as { window?: unknown }).window = {};
	});

	afterEach(() => {
		(globalThis as { window?: unknown }).window = originalWindow;
	});

	describe('getSolflareProvider', () => {
		it('returns null when window is undefined', () => {
			delete (globalThis as { window?: unknown }).window;
			expect(getSolflareProvider()).toBeNull();
		});

		it('returns null when Solflare is not installed', () => {
			(globalThis as { window?: unknown }).window = {};
			expect(getSolflareProvider()).toBeNull();
		});

		it('returns the provider when window.solflare is present', () => {
			const mock = makeMockProvider();
			(globalThis as { window?: unknown }).window = { solflare: mock };
			expect(getSolflareProvider()).toBe(mock);
		});

		it('returns null when window.solflare lacks a connect function', () => {
			// Some extensions inject a stub object before the wallet is ready.
			(globalThis as { window?: unknown }).window = { solflare: {} };
			expect(getSolflareProvider()).toBeNull();
		});
	});

	describe('isSolflareInstalled', () => {
		it('returns true when Solflare is installed', () => {
			(globalThis as { window?: unknown }).window = { solflare: makeMockProvider() };
			expect(isSolflareInstalled()).toBe(true);
		});

		it('returns false when Solflare is not installed', () => {
			(globalThis as { window?: unknown }).window = {};
			expect(isSolflareInstalled()).toBe(false);
		});

		it('returns false when window is undefined', () => {
			delete (globalThis as { window?: unknown }).window;
			expect(isSolflareInstalled()).toBe(false);
		});
	});

	describe('connectSolflare', () => {
		it('connects and returns the public key from the provider object', async () => {
			const publicKey = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const mock = makeMockProvider({
				connect: vi.fn().mockImplementation(async function (this: SolflareProvider) {
					// Solflare mutates the provider object in place rather than returning
					// the public key from connect() — model that here.
					this.publicKey = publicKey;
					this.isConnected = true;
				})
			});
			// `connect` is a mocked function but `this` binding above relies on the
			// actual provider reference; rebind by re-assigning after construction.
			mock.connect = vi.fn().mockImplementation(async () => {
				mock.publicKey = publicKey;
				mock.isConnected = true;
			});

			(globalThis as { window?: unknown }).window = { solflare: mock };

			const result = await connectSolflare();
			expect(result).toEqual(publicKey);
			expect(mock.connect).toHaveBeenCalledWith(undefined);
		});

		it('passes onlyIfTrusted option to Solflare', async () => {
			const publicKey = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const mock = makeMockProvider();
			mock.connect = vi.fn().mockImplementation(async () => {
				mock.publicKey = publicKey;
			});

			(globalThis as { window?: unknown }).window = { solflare: mock };

			await connectSolflare({ onlyIfTrusted: true });
			expect(mock.connect).toHaveBeenCalledWith({ onlyIfTrusted: true });
		});

		it('throws when Solflare is not found', async () => {
			(globalThis as { window?: unknown }).window = {};
			await expect(connectSolflare()).rejects.toThrow('Solflare not found');
		});

		it('throws when user rejects the request', async () => {
			const mock = makeMockProvider({
				connect: vi.fn().mockRejectedValue(new Error('User rejected the request.'))
			});
			(globalThis as { window?: unknown }).window = { solflare: mock };
			await expect(connectSolflare()).rejects.toThrow('User rejected the request.');
		});

		it('throws when Solflare resolves connect but exposes no publicKey', async () => {
			const mock = makeMockProvider({
				connect: vi.fn().mockResolvedValue(undefined)
				// publicKey stays null — emulates a stuck handshake
			});
			(globalThis as { window?: unknown }).window = { solflare: mock };
			await expect(connectSolflare()).rejects.toThrow('Solflare connected but no publicKey');
		});

		it('propagates arbitrary Solflare errors', async () => {
			const mock = makeMockProvider({
				connect: vi.fn().mockRejectedValue(new Error('Network error'))
			});
			(globalThis as { window?: unknown }).window = { solflare: mock };
			await expect(connectSolflare()).rejects.toThrow('Network error');
		});
	});

	describe('disconnectSolflare', () => {
		it('disconnects from Solflare', async () => {
			const mock = makeMockProvider({
				isConnected: true,
				disconnect: vi.fn().mockResolvedValue(undefined)
			});
			(globalThis as { window?: unknown }).window = { solflare: mock };

			await disconnectSolflare();
			expect(mock.disconnect).toHaveBeenCalled();
		});

		it('does not throw when Solflare is not installed', async () => {
			(globalThis as { window?: unknown }).window = {};
			await expect(disconnectSolflare()).resolves.toBeUndefined();
		});

		it('swallows disconnect errors', async () => {
			const mock = makeMockProvider({
				disconnect: vi.fn().mockRejectedValue(new Error('Disconnect failed'))
			});
			(globalThis as { window?: unknown }).window = { solflare: mock };
			await expect(disconnectSolflare()).resolves.toBeUndefined();
		});
	});

	describe('integration', () => {
		it('supports full connect-disconnect flow', async () => {
			const publicKey = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const mock = makeMockProvider();
			mock.connect = vi.fn().mockImplementation(async () => {
				mock.publicKey = publicKey;
				mock.isConnected = true;
			});

			(globalThis as { window?: unknown }).window = { solflare: mock };

			const connected = await connectSolflare();
			expect(connected).toEqual(publicKey);
			expect(isSolflareInstalled()).toBe(true);

			await disconnectSolflare();
			expect(mock.disconnect).toHaveBeenCalled();
		});
	});
});
