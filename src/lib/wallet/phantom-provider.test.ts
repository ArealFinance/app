import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
	getPhantomProvider,
	isPhantomInstalled,
	connectPhantom,
	disconnectPhantom,
	type PhantomProvider
} from './phantom-provider';

describe('phantom-provider', () => {
	// Store original window for restoration
	let originalWindow: any;

	beforeEach(() => {
		// Save original window state
		originalWindow = (globalThis as any).window;
		// Reset window object
		(globalThis as any).window = {};
	});

	afterEach(() => {
		// Restore original window
		(globalThis as any).window = originalWindow;
	});

	describe('getPhantomProvider', () => {
		it('should return null when window is undefined', () => {
			delete (globalThis as any).window;
			expect(getPhantomProvider()).toBeNull();
		});

		it('should return null when Phantom is not installed', () => {
			(globalThis as any).window = {};
			expect(getPhantomProvider()).toBeNull();
		});

		it('should prefer window.phantom.solana when both are available', () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			const mockLegacyProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider },
				solana: mockLegacyProvider
			};

			const provider = getPhantomProvider();
			expect(provider).toBe(mockProvider);
		});

		it('should fall back to window.solana when phantom.solana unavailable', () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				solana: mockProvider
			};

			const provider = getPhantomProvider();
			expect(provider).toBe(mockProvider);
		});

		it('should check isPhantom flag on phantom.solana', () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: false, // Not marked as Phantom
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			expect(getPhantomProvider()).toBeNull();
		});

		it('should check isPhantom flag on window.solana', () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: false,
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				solana: mockProvider
			};

			expect(getPhantomProvider()).toBeNull();
		});

		it('should return actual provider when isPhantom is true', () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			const provider = getPhantomProvider();
			expect(provider).not.toBeNull();
			expect(provider).toBe(mockProvider);
		});
	});

	describe('isPhantomInstalled', () => {
		it('should return true when Phantom is installed', () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			expect(isPhantomInstalled()).toBe(true);
		});

		it('should return false when Phantom is not installed', () => {
			(globalThis as any).window = {};
			expect(isPhantomInstalled()).toBe(false);
		});

		it('should return false when window is undefined', () => {
			delete (globalThis as any).window;
			expect(isPhantomInstalled()).toBe(false);
		});
	});

	describe('connectPhantom', () => {
		it('should connect to Phantom and return public key', async () => {
			const publicKeyAddress = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
			const publicKey = new PublicKey(publicKeyAddress);

			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn().mockResolvedValue({ publicKey }),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			const result = await connectPhantom();
			expect(result).toEqual(publicKey);
			expect(mockProvider.connect).toHaveBeenCalledWith(undefined);
		});

		it('should pass onlyIfTrusted option to Phantom', async () => {
			const publicKey = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn().mockResolvedValue({ publicKey }),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			await connectPhantom({ onlyIfTrusted: true });

			expect(mockProvider.connect).toHaveBeenCalledWith({ onlyIfTrusted: true });
		});

		it('should throw error when Phantom not found', async () => {
			(globalThis as any).window = {};

			await expect(connectPhantom()).rejects.toThrow('Phantom not found');
		});

		it('should throw error when user rejects connection', async () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn().mockRejectedValue(new Error('User rejected the request.')),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			await expect(connectPhantom()).rejects.toThrow('User rejected the request.');
		});

		it('should propagate any Phantom error', async () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn().mockRejectedValue(new Error('Network error')),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			await expect(connectPhantom()).rejects.toThrow('Network error');
		});

		it('should work with legacy window.solana path', async () => {
			const publicKey = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn().mockResolvedValue({ publicKey }),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				solana: mockProvider
			};

			const result = await connectPhantom();
			expect(result).toEqual(publicKey);
		});
	});

	describe('disconnectPhantom', () => {
		it('should disconnect from Phantom', async () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: true,
				connect: vi.fn(),
				disconnect: vi.fn().mockResolvedValue(undefined),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			await disconnectPhantom();
			expect(mockProvider.disconnect).toHaveBeenCalled();
		});

		it('should not throw when Phantom not installed', async () => {
			(globalThis as any).window = {};

			// Should not throw
			await expect(disconnectPhantom()).resolves.toBeUndefined();
		});

		it('should swallow disconnect errors', async () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: true,
				connect: vi.fn(),
				disconnect: vi.fn().mockRejectedValue(new Error('Disconnect failed')),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			// Should not throw even though disconnect failed
			await expect(disconnectPhantom()).resolves.toBeUndefined();
		});

		it('should be safe to call multiple times', async () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn(),
				disconnect: vi.fn().mockResolvedValue(undefined),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			await disconnectPhantom();
			await disconnectPhantom();

			// Disconnect should have been called both times (or not at all on second call if provider became null)
			expect(mockProvider.disconnect).toHaveBeenCalled();
		});

		it('should work with legacy window.solana path', async () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: true,
				connect: vi.fn(),
				disconnect: vi.fn().mockResolvedValue(undefined),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				solana: mockProvider
			};

			await disconnectPhantom();
			expect(mockProvider.disconnect).toHaveBeenCalled();
		});
	});

	describe('integration scenarios', () => {
		it('should support full connect-disconnect flow', async () => {
			const publicKey = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			const mockProvider: PhantomProvider = {
				publicKey,
				isPhantom: true,
				isConnected: true,
				connect: vi.fn().mockResolvedValue({ publicKey }),
				disconnect: vi.fn().mockResolvedValue(undefined),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			// Connect
			const connected = await connectPhantom();
			expect(connected).toEqual(publicKey);
			expect(isPhantomInstalled()).toBe(true);

			// Disconnect
			await disconnectPhantom();
			expect(mockProvider.disconnect).toHaveBeenCalled();
		});

		it('should handle connect rejection gracefully', async () => {
			const mockProvider: PhantomProvider = {
				publicKey: null,
				isPhantom: true,
				isConnected: false,
				connect: vi.fn().mockRejectedValue(new Error('User rejected the request.')),
				disconnect: vi.fn(),
				signTransaction: vi.fn(),
				signAndSendTransaction: vi.fn(),
				signMessage: vi.fn(),
				on: vi.fn(),
				off: vi.fn()
			};

			(globalThis as any).window = {
				phantom: { solana: mockProvider }
			};

			// Should throw
			await expect(connectPhantom()).rejects.toThrow();

			// But disconnectPhantom should still work
			await expect(disconnectPhantom()).resolves.toBeUndefined();
		});
	});
});
