/*
 * Wallet store unit tests.
 *
 * Phase 7 scope: the `signAndSendTransaction` adapter — verifies dispatch
 * to the active provider, error surfacing, and the disconnected-state guard.
 *
 * The store under test is a runes-based singleton imported once. Each test
 * resets connection state by calling `wallet.disconnect()` in `beforeEach`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Transaction } from '@solana/web3.js';

const phantomProvider = {
	publicKey: null as unknown,
	isPhantom: true,
	isConnected: false,
	connect: vi.fn(async () => ({ publicKey: { toBase58: () => 'PhantomKey' } })),
	disconnect: vi.fn(async () => undefined),
	signTransaction: vi.fn(),
	signAndSendTransaction: vi.fn(),
	on: vi.fn(),
	off: vi.fn()
};

const solflareProvider = {
	publicKey: null as unknown,
	isSolflare: true,
	isConnected: false,
	connect: vi.fn(async () => undefined),
	disconnect: vi.fn(async () => undefined),
	signTransaction: vi.fn(),
	signAndSendTransaction: vi.fn(),
	on: vi.fn(),
	off: vi.fn()
};

// `connectPhantom` / `connectSolflare` are mocked to control the connect
// flow without touching the (unrelated) deeplink/global detection logic.
//
// The wallet store imports `getPhantomProvider`/`getSolflareProvider` from
// the `$lib/wallet` barrel statically (sync probes), and lazy-imports the
// `connect*`/`disconnect*` flows directly from the provider modules. Mock
// both surfaces so either import path returns the test doubles.
vi.mock('$lib/wallet', async () => {
	return {
		getPhantomProvider: () => phantomProvider,
		getSolflareProvider: () => solflareProvider
	};
});

vi.mock('$lib/wallet/phantom-provider', async () => ({
	connectPhantom: vi.fn(async () => ({ toBase58: () => 'PhantomKey' })),
	disconnectPhantom: vi.fn(async () => undefined),
	getPhantomProvider: () => phantomProvider
}));

vi.mock('$lib/wallet/solflare-provider', async () => ({
	connectSolflare: vi.fn(async () => ({ toBase58: () => 'SolflareKey' })),
	disconnectSolflare: vi.fn(async () => undefined),
	getSolflareProvider: () => solflareProvider
}));

vi.mock('$lib/errors', () => ({
	showError: vi.fn()
}));

import { wallet } from './wallet.svelte';

describe('wallet.signAndSendTransaction', () => {
	beforeEach(async () => {
		await wallet.disconnect();
		phantomProvider.signAndSendTransaction.mockReset();
		solflareProvider.signAndSendTransaction.mockReset();
	});

	it('throws when wallet is not connected', async () => {
		const tx = new Transaction();
		await expect(wallet.signAndSendTransaction(tx)).rejects.toThrow(
			/Wallet not connected/
		);
	});

	it('dispatches to Phantom provider when connected via Phantom', async () => {
		await wallet.connect('phantom');
		expect(wallet.isConnected).toBe(true);

		phantomProvider.signAndSendTransaction.mockResolvedValue({ signature: 'sigP' });

		const tx = new Transaction();
		const res = await wallet.signAndSendTransaction(tx);

		expect(res.signature).toBe('sigP');
		expect(phantomProvider.signAndSendTransaction).toHaveBeenCalledWith(tx);
		expect(solflareProvider.signAndSendTransaction).not.toHaveBeenCalled();
	});

	it('dispatches to Solflare provider when connected via Solflare', async () => {
		await wallet.connect('solflare');
		expect(wallet.isConnected).toBe(true);

		solflareProvider.signAndSendTransaction.mockResolvedValue({ signature: 'sigS' });

		const tx = new Transaction();
		const res = await wallet.signAndSendTransaction(tx);

		expect(res.signature).toBe('sigS');
		expect(solflareProvider.signAndSendTransaction).toHaveBeenCalledWith(tx);
		expect(phantomProvider.signAndSendTransaction).not.toHaveBeenCalled();
	});

	it('surfaces user-rejection errors with consistent message shape', async () => {
		await wallet.connect('phantom');

		phantomProvider.signAndSendTransaction.mockRejectedValue(
			new Error('User rejected the request')
		);

		const tx = new Transaction();
		await expect(wallet.signAndSendTransaction(tx)).rejects.toThrow(
			/User rejected/
		);
	});

	it('passes through arbitrary provider errors unchanged', async () => {
		await wallet.connect('phantom');

		const err = new Error('blockhash not found');
		phantomProvider.signAndSendTransaction.mockRejectedValue(err);

		const tx = new Transaction();
		await expect(wallet.signAndSendTransaction(tx)).rejects.toBe(err);
	});
});
