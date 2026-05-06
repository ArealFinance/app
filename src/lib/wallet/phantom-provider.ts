/*
 * Phantom desktop wallet provider — thin shim over `window.phantom.solana`.
 *
 * Phantom injects two API surfaces:
 *   - `window.phantom.solana` (newer, preferred)
 *   - `window.solana` (legacy, still present for back-compat)
 *
 * We accept both. The mobile in-app browser uses the same global, so this
 * file works in both contexts. For the standalone mobile case (no in-app
 * browser), see `phantom-deeplink.ts`.
 */
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export interface PhantomProvider {
	publicKey: PublicKey | null;
	isPhantom?: boolean;
	isConnected: boolean;
	connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
	disconnect(): Promise<void>;
	signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
	signAndSendTransaction<T extends Transaction | VersionedTransaction>(
		tx: T
	): Promise<{ signature: string }>;
	on(event: string, handler: (...args: unknown[]) => void): void;
	off(event: string, handler: (...args: unknown[]) => void): void;
}

interface PhantomGlobals {
	phantom?: { solana?: PhantomProvider };
	solana?: PhantomProvider;
}

/** Resolve the Phantom provider, preferring the newer `phantom.solana` shape. */
export function getPhantomProvider(): PhantomProvider | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as PhantomGlobals;
	if (w.phantom?.solana?.isPhantom) return w.phantom.solana;
	if (w.solana?.isPhantom) return w.solana;
	return null;
}

export function isPhantomInstalled(): boolean {
	return getPhantomProvider() !== null;
}

/**
 * Open the Phantom connect prompt and return the resolved public key.
 *
 * Throws when Phantom isn't installed, or when the user dismisses the
 * prompt (Phantom rejects with `User rejected the request.`).
 */
export async function connectPhantom(opts?: { onlyIfTrusted?: boolean }): Promise<PublicKey> {
	const provider = getPhantomProvider();
	if (!provider) {
		throw new Error('Phantom not found');
	}
	const { publicKey } = await provider.connect(opts);
	return publicKey;
}

/** Disconnect — best-effort, swallows errors. */
export async function disconnectPhantom(): Promise<void> {
	const provider = getPhantomProvider();
	if (!provider) return;
	try {
		await provider.disconnect();
	} catch {
		/* swallow — disconnect failure shouldn't block our UI cleanup */
	}
}
