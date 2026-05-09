/*
 * Solflare desktop wallet provider — thin shim over `window.solflare`.
 *
 * Solflare's injected API differs slightly from Phantom's:
 *   - `connect()` resolves to `void` (or `boolean`) instead of `{ publicKey }`.
 *     The public key is read from the provider object after connect resolves.
 *   - `isSolflare` flag is the recommended sniff (mirrors Phantom's `isPhantom`).
 *
 * We adapt those differences so the call shape mirrors `phantom-provider.ts`
 * (`connectSolflare()` returns the resolved `PublicKey`).
 *
 * Reference: areal.finance/frontend/src/lib/stores/wallet.ts (classic-store
 * version) — same provider shape, ported to the runes-style codebase.
 */
import type { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

/*
 * Solflare emits the same three lifecycle events as Phantom. Typing them by
 * event name (overload signatures) keeps call sites cast-free.
 */
export type SolflareConnectHandler = (publicKey: PublicKey) => void;
export type SolflareDisconnectHandler = () => void;
export type SolflareAccountChangedHandler = (publicKey: PublicKey | null) => void;

export interface SolflareProvider {
	publicKey: PublicKey | null;
	isSolflare?: boolean;
	isConnected: boolean;
	/*
	 * Solflare's `connect` historically resolves with `boolean | void`; we widen
	 * to `unknown` so we don't lock to one shape. The resolved public key is
	 * read from `provider.publicKey` after the promise settles.
	 */
	connect(opts?: { onlyIfTrusted?: boolean }): Promise<unknown>;
	disconnect(): Promise<void>;
	signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
	signAndSendTransaction<T extends Transaction | VersionedTransaction>(
		tx: T
	): Promise<{ signature: string }>;
	/*
	 * Sign an arbitrary byte payload — used for the wallet-signature auth
	 * handshake. Solflare exposes the same shape as Phantom (`{ signature,
	 * publicKey? }`), so the call site can reuse the same code path. The
	 * `display` hint is best-effort: Solflare honours `'utf8'` to render the
	 * payload as plain text in the approval prompt (matches Phantom's UX).
	 */
	signMessage(
		message: Uint8Array,
		display?: 'utf8' | 'hex'
	): Promise<{ signature: Uint8Array; publicKey?: PublicKey }>;
	on(event: 'connect', handler: SolflareConnectHandler): void;
	on(event: 'disconnect', handler: SolflareDisconnectHandler): void;
	on(event: 'accountChanged', handler: SolflareAccountChangedHandler): void;
	off(event: 'connect', handler: SolflareConnectHandler): void;
	off(event: 'disconnect', handler: SolflareDisconnectHandler): void;
	off(event: 'accountChanged', handler: SolflareAccountChangedHandler): void;
}

interface SolflareGlobals {
	solflare?: SolflareProvider;
}

/** Resolve the Solflare provider via `window.solflare`. */
export function getSolflareProvider(): SolflareProvider | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as SolflareGlobals;
	// Some environments inject a stub without the `isSolflare` flag; we accept
	// any object that exposes `connect` / `disconnect`.
	if (w.solflare && typeof w.solflare.connect === 'function') return w.solflare;
	return null;
}

export function isSolflareInstalled(): boolean {
	return getSolflareProvider() !== null;
}

/**
 * Open the Solflare connect prompt and return the resolved public key.
 *
 * Throws when Solflare isn't installed, when the user dismisses the prompt,
 * or when Solflare resolves connect() but exposes no `publicKey`.
 */
export async function connectSolflare(opts?: { onlyIfTrusted?: boolean }): Promise<PublicKey> {
	const provider = getSolflareProvider();
	if (!provider) {
		throw new Error('Solflare not found');
	}
	await provider.connect(opts);
	if (!provider.publicKey) {
		throw new Error('Solflare connected but no publicKey');
	}
	return provider.publicKey;
}

/** Disconnect — best-effort, swallows errors. */
export async function disconnectSolflare(): Promise<void> {
	const provider = getSolflareProvider();
	if (!provider) return;
	try {
		await provider.disconnect();
	} catch {
		/* swallow — disconnect failure shouldn't block our UI cleanup */
	}
}
