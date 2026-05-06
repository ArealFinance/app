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

/*
 * Phantom emits three events. Typing them per-name (overload signatures)
 * lets call sites get the right handler shape without casting.
 *
 *   - `connect`        → fired after a successful connect; receives the
 *                        resolved public key.
 *   - `disconnect`     → fired when the user disconnects (no payload).
 *   - `accountChanged` → fired when the user switches the active account in
 *                        the Phantom UI. The new public key is passed, or
 *                        `null` if the user disconnected the previously
 *                        trusted account.
 */
export type PhantomConnectHandler = (publicKey: PublicKey) => void;
export type PhantomDisconnectHandler = () => void;
export type PhantomAccountChangedHandler = (publicKey: PublicKey | null) => void;

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
	on(event: 'connect', handler: PhantomConnectHandler): void;
	on(event: 'disconnect', handler: PhantomDisconnectHandler): void;
	on(event: 'accountChanged', handler: PhantomAccountChangedHandler): void;
	off(event: 'connect', handler: PhantomConnectHandler): void;
	off(event: 'disconnect', handler: PhantomDisconnectHandler): void;
	off(event: 'accountChanged', handler: PhantomAccountChangedHandler): void;
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
