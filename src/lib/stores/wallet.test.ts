/*
 * Wallet store unit tests.
 *
 * Phase 7 scope: the `signAndSendTransaction` adapter — verifies dispatch
 * to the active provider, error surfacing, and the disconnected-state guard.
 *
 * The store under test is a runes-based singleton imported once. Each test
 * resets connection state by calling `wallet.disconnect()` in `beforeEach`.
 *
 * Implementation note: production `wallet.signAndSendTransaction` is a two-
 * step flow — `provider.signTransaction(tx)` returns a signed Transaction,
 * then `network.connection.sendRawTransaction(signed.serialize())` submits
 * it. Tests below mock both surfaces and assert the dispatch on the right
 * provider.signTransaction call.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Transaction } from '@solana/web3.js';

// Used as the resolved return value for `provider.signTransaction`. Must
// expose `serialize()` because `signAndSendTransaction` calls it before
// handing the wire bytes to the Connection's sendRawTransaction.
const fakeSignedTx = { serialize: () => new Uint8Array([1, 2, 3]) };

const phantomProvider = {
	publicKey: null as unknown,
	isPhantom: true,
	isConnected: false,
	connect: vi.fn(async () => ({ publicKey: { toBase58: () => 'PhantomKey' } })),
	disconnect: vi.fn(async () => undefined),
	signTransaction: vi.fn(async () => fakeSignedTx),
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
	signTransaction: vi.fn(async () => fakeSignedTx),
	signAndSendTransaction: vi.fn(),
	on: vi.fn(),
	off: vi.fn()
};

// Network connection mock — `wallet.signAndSendTransaction` reads
// `network.connection.sendRawTransaction` to submit the signed bytes.
const sendRawTransaction = vi.fn(async () => 'mockSignature');

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get connection() {
			return { sendRawTransaction };
		}
	}
}));

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
		// Reset call history but keep the default `async () => fakeSignedTx`
		// resolution shape — individual tests override on the per-case basis.
		phantomProvider.signTransaction.mockReset();
		phantomProvider.signTransaction.mockResolvedValue(fakeSignedTx);
		solflareProvider.signTransaction.mockReset();
		solflareProvider.signTransaction.mockResolvedValue(fakeSignedTx);
		sendRawTransaction.mockReset();
		sendRawTransaction.mockResolvedValue('mockSignature');
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

		sendRawTransaction.mockResolvedValueOnce('sigP');

		const tx = new Transaction();
		const res = await wallet.signAndSendTransaction(tx);

		expect(res.signature).toBe('sigP');
		expect(phantomProvider.signTransaction).toHaveBeenCalledWith(tx);
		expect(solflareProvider.signTransaction).not.toHaveBeenCalled();
		expect(sendRawTransaction).toHaveBeenCalledTimes(1);
	});

	it('dispatches to Solflare provider when connected via Solflare', async () => {
		await wallet.connect('solflare');
		expect(wallet.isConnected).toBe(true);

		sendRawTransaction.mockResolvedValueOnce('sigS');

		const tx = new Transaction();
		const res = await wallet.signAndSendTransaction(tx);

		expect(res.signature).toBe('sigS');
		expect(solflareProvider.signTransaction).toHaveBeenCalledWith(tx);
		expect(phantomProvider.signTransaction).not.toHaveBeenCalled();
		expect(sendRawTransaction).toHaveBeenCalledTimes(1);
	});

	it('surfaces user-rejection errors with consistent message shape', async () => {
		await wallet.connect('phantom');

		phantomProvider.signTransaction.mockRejectedValueOnce(
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
		phantomProvider.signTransaction.mockRejectedValueOnce(err);

		const tx = new Transaction();
		await expect(wallet.signAndSendTransaction(tx)).rejects.toBe(err);
	});
});
