/*
 * Wallet-signature auth store — runes-based singleton.
 *
 * Owns the JWT pair returned by `POST /auth/login` (Phase 5 wallet-signature
 * handshake) and rotates them via `POST /auth/refresh` before they expire.
 * Persists across reloads through a single `app:auth:v1` blob in
 * sessionStorage so a brand-new tab, opened to the same wallet, doesn't
 * have to re-prompt.
 *
 * Public surface:
 *   auth.{status, wallet, accessToken, expiresAt, error,
 *         isSignedIn, isSignedInForCurrentWallet,
 *         signIn(), signOut(), refresh()}
 *
 * Critical correctness invariants (NON-NEGOTIABLE):
 *
 *   1. Single-flight refresh. Two concurrent `refresh()` callers share one
 *      in-flight promise, otherwise we'd burn a refresh token (the backend
 *      rotates the row on every refresh — issuing two parallel requests
 *      means one of them lands on a now-revoked token and 401s, dragging
 *      the user to `expired` even though their session is still valid).
 *
 *   2. Late-response guard via `authToken: number`. Bumped on every login,
 *      refresh success, wallet change, and signOut. Async resolutions
 *      compare the captured token to the current one and silently drop
 *      on mismatch — covers the wallet-switch-mid-flight race.
 *
 *   3. `$effect.root` watching `wallet.publicKey`. Disconnect or pubkey
 *      change → clear tokens, status='signed-out', bump authToken. The
 *      auth store does NOT survive a wallet change — auth is wallet-
 *      scoped and a new wallet must run its own signIn handshake.
 *
 *   4. sessionStorage rehydrate at module load. We read the blob synchronously
 *      so the first render after a reload sees `signed-in` (not a flash
 *      of `signed-out`). If the persisted token is within 60s of expiry
 *      we kick a refresh on boot — failure → `expired` (banner state).
 *
 *   5. `expired` is a sticky terminal state until the user re-signs OR
 *      disconnects. The wallet pubkey is RETAINED in the expired state so
 *      the re-sign banner has the context it needs to greet the user.
 */
import bs58 from 'bs58';
import { BACKEND_API_BASE_URLS } from '@areal/sdk/network';
import { env as publicEnv } from '$env/dynamic/public';

import { wallet } from '$lib/stores/wallet.svelte';
import { network } from '$lib/network/network.svelte';
import { getPhantomProvider, getSolflareProvider } from '$lib/wallet';

import { buildLoginMessage } from './messages';
import { REFRESH_THRESHOLD_MS } from './constants';

/**
 * Browser-side flag — `sessionStorage` is the canonical sniff for "is this
 * the client". Used to gate module-load rehydrate and the wallet-watch
 * effect (the server has neither sessionStorage nor a reactive runtime).
 */
const browser = typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

/** Sessions states. See module-level docstring for transition diagram. */
export type AuthStatus =
	| 'signed-out'
	| 'signing'
	| 'authenticating'
	| 'signed-in'
	| 'expired'
	| 'error';

/** sessionStorage key. Keep the version suffix — bump if the blob shape changes. */
const STORAGE_KEY = 'app:auth:v1';

/** Persisted blob shape. Atomic write/read. */
interface PersistedAuth {
	accessToken: string;
	refreshToken: string;
	/** ISO-8601 timestamp. Decoded into ms-epoch on rehydrate. */
	expiresAt: string;
	/** base58 wallet pubkey the tokens are bound to. */
	wallet: string;
}

// ─────────────────────────── reactive state ───────────────────────────

let status: AuthStatus = $state('signed-out');
let storedWallet: string | null = $state(null);
let accessToken: string | null = $state(null);
let refreshToken: string | null = $state(null);
let expiresAt: number | null = $state(null);
let lastError: string | null = $state(null);

// ─────────────────────────── bookkeeping (non-reactive) ──────────────────

/**
 * Late-response guard — bumped on every login / refresh success / wallet
 * change / signOut. Async resolutions compare to the captured value and
 * silently drop on mismatch.
 */
let authToken = 0;

/**
 * Single-flight refresh promise. While set, concurrent `refresh()` calls
 * return this same promise instead of spawning a parallel HTTP request.
 */
let pendingRefresh: Promise<boolean> | null = null;

/** Effect-root teardown handle for the wallet-watch effect. */
let stopEffect: (() => void) | null = null;

// ─────────────────────────── persistence ───────────────────────────

function readPersisted(): PersistedAuth | null {
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		const p = parsed as Partial<PersistedAuth>;
		if (
			typeof p.accessToken !== 'string' ||
			typeof p.refreshToken !== 'string' ||
			typeof p.expiresAt !== 'string' ||
			typeof p.wallet !== 'string' ||
			p.accessToken.length === 0 ||
			p.refreshToken.length === 0 ||
			p.wallet.length === 0
		) {
			return null;
		}
		// Validate the timestamp parses; reject otherwise.
		const ts = Date.parse(p.expiresAt);
		if (!Number.isFinite(ts)) return null;
		return {
			accessToken: p.accessToken,
			refreshToken: p.refreshToken,
			expiresAt: p.expiresAt,
			wallet: p.wallet
		};
	} catch {
		return null;
	}
}

function writePersisted(blob: PersistedAuth): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
	} catch {
		// QuotaExceeded etc — safe to ignore; we keep the in-memory state.
	}
}

function clearPersisted(): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignored — same rationale as writePersisted.
	}
}

function persistCurrentTokens(): void {
	if (
		!accessToken ||
		!refreshToken ||
		expiresAt === null ||
		!storedWallet
	) {
		return;
	}
	writePersisted({
		accessToken,
		refreshToken,
		expiresAt: new Date(expiresAt).toISOString(),
		wallet: storedWallet
	});
}

// ─────────────────────────── URL resolution ───────────────────────────

/**
 * Resolve the auth backend baseUrl.
 *
 * Order:
 *   1. PUBLIC_AUTH_API_URL env override (deploy-time tweak)
 *   2. BACKEND_API_BASE_URLS[network.current] (same backend deployment as
 *      `@areal/sdk/markets-rest` and `@areal/sdk/history`)
 */
function resolveAuthBaseUrl(): string | null {
	const override = publicEnv.PUBLIC_AUTH_API_URL;
	if (override && override.length > 0) return override;
	const fromCluster = BACKEND_API_BASE_URLS[network.current];
	if (fromCluster && fromCluster.length > 0) return fromCluster;
	return null;
}

// ─────────────────────────── HTTP helpers ───────────────────────────

interface LoginResponse {
	accessToken: string;
	refreshToken: string;
	/** ISO-8601 absolute expiry timestamp (preferred). */
	expiresAt?: string;
	/** Lifetime in seconds (fallback if backend returns expiresIn instead). */
	expiresIn?: number;
}

function parseExpiresAt(body: LoginResponse, fallbackNow: number): number {
	if (body.expiresAt) {
		const t = Date.parse(body.expiresAt);
		if (Number.isFinite(t)) return t;
	}
	if (typeof body.expiresIn === 'number' && Number.isFinite(body.expiresIn)) {
		return fallbackNow + body.expiresIn * 1000;
	}
	// Defensive — backend always returns one of the two; default to a 7-day
	// horizon so the UI doesn't explode if the field is missing.
	return fallbackNow + 7 * 24 * 60 * 60 * 1000;
}

async function postJson(url: string, body: unknown): Promise<Response> {
	return fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

// ─────────────────────────── flows ───────────────────────────

async function signIn(): Promise<void> {
	if (status === 'signing' || status === 'authenticating') return;

	const pk = wallet.publicKey;
	const providerName = wallet.provider;
	if (!pk || !providerName) {
		throw new Error('Wallet not connected');
	}
	const walletBase58 = pk.toBase58();

	const baseUrl = resolveAuthBaseUrl();
	if (baseUrl === null) {
		status = 'error';
		lastError = 'Unknown cluster';
		return;
	}

	status = 'signing';
	lastError = null;
	storedWallet = walletBase58;
	const tokenAtCall = ++authToken;

	let signatureBase58: string;
	try {
		const provider =
			providerName === 'phantom' ? getPhantomProvider() : getSolflareProvider();
		if (!provider) {
			throw new Error(`${providerName} provider not available`);
		}
		const { message } = buildLoginMessage(walletBase58);
		const encoded = new TextEncoder().encode(message);
		const result = await provider.signMessage(encoded, 'utf8');
		if (tokenAtCall !== authToken) return; // wallet swap mid-sign — drop.
		if (!result?.signature) throw new Error('Wallet returned no signature');
		signatureBase58 = bs58.encode(result.signature);

		status = 'authenticating';

		const res = await postJson(`${baseUrl}/auth/login`, {
			wallet: walletBase58,
			signature: signatureBase58,
			message
		});
		if (tokenAtCall !== authToken) return;

		if (!res.ok) {
			let hint = `HTTP ${res.status}`;
			if (res.status === 429) hint = 'Too many sign-in attempts — slow down';
			else if (res.status === 401) hint = 'Invalid signature';
			else {
				try {
					const body = (await res.json()) as { message?: string };
					if (body?.message) hint = body.message;
				} catch {
					/* keep default hint */
				}
			}
			status = 'error';
			lastError = hint;
			accessToken = null;
			refreshToken = null;
			expiresAt = null;
			return;
		}

		const body = (await res.json()) as LoginResponse;
		if (tokenAtCall !== authToken) return;

		accessToken = body.accessToken;
		refreshToken = body.refreshToken;
		expiresAt = parseExpiresAt(body, Date.now());
		status = 'signed-in';
		lastError = null;
		persistCurrentTokens();
	} catch (err) {
		if (tokenAtCall !== authToken) return;
		status = 'error';
		lastError = err instanceof Error ? err.message : String(err);
		accessToken = null;
		refreshToken = null;
		expiresAt = null;
	}
}

async function doRefresh(): Promise<boolean> {
	if (!refreshToken) return false;

	const baseUrl = resolveAuthBaseUrl();
	if (baseUrl === null) {
		status = 'error';
		lastError = 'Unknown cluster';
		return false;
	}

	const tokenAtCall = authToken;
	const tokenInUse = refreshToken;

	try {
		const res = await postJson(`${baseUrl}/auth/refresh`, {
			refreshToken: tokenInUse
		});
		if (tokenAtCall !== authToken) return false; // wallet swap / signOut.

		if (!res.ok) {
			// 401 (rotation revoked the row) → expired terminal state.
			// Bump before commit so concurrent observers compare against the new token.
			authToken++;
			status = 'expired';
			lastError = res.status === 401 ? 'Session expired' : `HTTP ${res.status}`;
			accessToken = null;
			refreshToken = null;
			expiresAt = null;
			clearPersisted();
			// Wallet pubkey retained — banner needs it for the re-sign hint.
			return false;
		}

		const body = (await res.json()) as LoginResponse;
		if (tokenAtCall !== authToken) return false;

		// Bump before commit so concurrent observers compare against the new token.
		authToken++;
		accessToken = body.accessToken;
		refreshToken = body.refreshToken;
		expiresAt = parseExpiresAt(body, Date.now());
		status = 'signed-in';
		lastError = null;
		persistCurrentTokens();
		return true;
	} catch (err) {
		if (tokenAtCall !== authToken) return false;
		// Bump before commit so concurrent observers compare against the new token.
		authToken++;
		status = 'expired';
		lastError = err instanceof Error ? err.message : String(err);
		accessToken = null;
		refreshToken = null;
		expiresAt = null;
		clearPersisted();
		return false;
	}
}

function refresh(): Promise<boolean> {
	if (pendingRefresh) return pendingRefresh;
	pendingRefresh = doRefresh().finally(() => {
		pendingRefresh = null;
	});
	return pendingRefresh;
}

function signOut(): void {
	authToken++;
	pendingRefresh = null;
	accessToken = null;
	refreshToken = null;
	expiresAt = null;
	storedWallet = null;
	lastError = null;
	status = 'signed-out';
	clearPersisted();
}

// ─────────────────────────── wallet-watch effect ───────────────────────

/**
 * Most-recent NON-NULL pubkey we've observed from the wallet store. We
 * only treat a `null` as a real "disconnect" once we've previously seen a
 * non-null value — without this, a fresh tab boot (where the wallet store
 * is still null while Phantom's `eagerConnect` works) would immediately
 * wipe rehydrated tokens.
 */
let observedWallet: string | null = null;

/**
 * Watch `wallet.publicKey`. A pubkey change to a DIFFERENT wallet or a
 * disconnect after a connect drops every tokens we have — the new wallet
 * (or no wallet) must run its own login.
 */
function ensureEffectRoot(): void {
	if (stopEffect !== null) return;
	stopEffect = $effect.root(() => {
		$effect(() => {
			const pk = wallet.publicKey;
			const next = pk ? pk.toBase58() : null;

			if (next !== null) {
				// Wallet is connected.
				if (observedWallet === null) {
					// First non-null observation. If it matches the rehydrated
					// session, do nothing; otherwise wipe (different wallet).
					observedWallet = next;
					if (storedWallet !== null && next !== storedWallet) {
						wipeAuth();
					}
					return;
				}
				if (next !== observedWallet) {
					// Live pubkey switch (account-changed) — always wipe.
					observedWallet = next;
					wipeAuth();
					return;
				}
				// Same wallet as before; no-op.
				return;
			}

			// next === null — wallet store currently reports no pubkey.
			if (observedWallet !== null) {
				// User actively disconnected after a connect.
				observedWallet = null;
				wipeAuth();
			}
			// observedWallet === null too → boot-time idle; don't touch state.
		});
	});
}

function wipeAuth(): void {
	authToken++;
	pendingRefresh = null;
	accessToken = null;
	refreshToken = null;
	expiresAt = null;
	storedWallet = null;
	lastError = null;
	status = 'signed-out';
	clearPersisted();
}

// ─────────────────────────── module-load rehydrate ───────────────────────

function rehydrateFromStorage(): void {
	if (!browser) return;
	const blob = readPersisted();
	if (!blob) return;

	const exp = Date.parse(blob.expiresAt);
	if (!Number.isFinite(exp)) {
		clearPersisted();
		return;
	}

	storedWallet = blob.wallet;
	accessToken = blob.accessToken;
	refreshToken = blob.refreshToken;
	expiresAt = exp;

	const now = Date.now();
	if (exp > now + REFRESH_THRESHOLD_MS) {
		// Plenty of headroom — boot directly into signed-in.
		status = 'signed-in';
		return;
	}

	// Either expired or near-expiry — try a preemptive refresh. The wallet
	// for which we held a token is in `storedWallet`; the wallet store will
	// rehydrate its own state in parallel and the wallet-watch effect will
	// reconcile any mismatch.
	status = 'authenticating';
	void refresh();
}

if (browser) {
	rehydrateFromStorage();
}

// ─────────────────────────── public surface ───────────────────────────

export interface AuthStore {
	readonly status: AuthStatus;
	readonly wallet: string | null;
	readonly accessToken: string | null;
	readonly expiresAt: number | null;
	readonly error: string | null;
	readonly isSignedIn: boolean;
	readonly isSignedInForCurrentWallet: boolean;
	signIn(): Promise<void>;
	signOut(): void;
	refresh(): Promise<boolean>;
	/** @internal — test-only. */
	__resetForTests?(): void;
	/** @internal — test-only: start watching wallet changes. */
	__ensureEffectForTests?(): void;
}

export const auth: AuthStore = {
	get status(): AuthStatus {
		return status;
	},
	get wallet(): string | null {
		return storedWallet;
	},
	get accessToken(): string | null {
		return accessToken;
	},
	get expiresAt(): number | null {
		return expiresAt;
	},
	get error(): string | null {
		return lastError;
	},
	get isSignedIn(): boolean {
		return status === 'signed-in' && accessToken !== null;
	},
	get isSignedInForCurrentWallet(): boolean {
		if (status !== 'signed-in' || accessToken === null) return false;
		const pk = wallet.publicKey;
		if (!pk) return false;
		return pk.toBase58() === storedWallet;
	},
	signIn,
	signOut,
	refresh,
	__resetForTests(): void {
		authToken++;
		pendingRefresh = null;
		accessToken = null;
		refreshToken = null;
		expiresAt = null;
		storedWallet = null;
		observedWallet = null;
		lastError = null;
		status = 'signed-out';
		clearPersisted();
		if (stopEffect) {
			stopEffect();
			stopEffect = null;
		}
	},
	__ensureEffectForTests(): void {
		ensureEffectRoot();
	}
};

// Start the wallet-watch effect on first import (browser only — server
// has no reactive runtime).
if (browser) {
	ensureEffectRoot();
}
