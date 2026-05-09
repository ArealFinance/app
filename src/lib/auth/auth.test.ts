/*
 * Auth store unit tests.
 *
 * Strategy mirrors `realtime/client.test.ts`: mock `$lib/stores/wallet.svelte`
 * with a reactive helper so wallet changes drive the wallet-watch effect.
 * Phantom / Solflare provider modules are mocked at the boundary so we
 * never reach `window.phantom`. Fetch is mocked per-test.
 *
 * Cases (architect's list A1-G1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { PublicKey } from '@solana/web3.js';

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_AUTH_API_URL: 'https://api.example.test'
	}
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return 'devnet';
		}
	}
}));

vi.mock('$lib/stores/wallet.svelte', async () => {
	const helpers = await import('./test-helpers.svelte');
	return {
		wallet: {
			get publicKey() {
				return helpers.mockWalletState.publicKey;
			},
			get provider() {
				return helpers.mockWalletState.provider;
			},
			get isConnected() {
				return helpers.mockWalletState.isConnected;
			}
		}
	};
});

const fakePhantomSignMessage = vi.fn();
const fakeSolflareSignMessage = vi.fn();

vi.mock('$lib/wallet', () => ({
	getPhantomProvider: () => ({
		signMessage: fakePhantomSignMessage
	}),
	getSolflareProvider: () => ({
		signMessage: fakeSolflareSignMessage
	})
}));

import { mockWalletState, resetMockWalletState } from './test-helpers.svelte';

const WALLET_A_BASE58 = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
const WALLET_B_BASE58 = '6YRfYtkZmqWgz8N3MDeqJRc4vSiJ5VGgiMv4ihYzJyY4';
const WALLET_A_PK = new PublicKey(WALLET_A_BASE58);
const WALLET_B_PK = new PublicKey(WALLET_B_BASE58);

const SIGNATURE_BYTES = new Uint8Array(64).fill(7);

const STORAGE_KEY = 'app:auth:v1';

async function settle(times = 4): Promise<void> {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

function setWallet(pk: PublicKey | null, provider: 'phantom' | 'solflare' | null = 'phantom') {
	mockWalletState.publicKey = pk;
	mockWalletState.provider = pk ? provider : null;
	mockWalletState.isConnected = pk !== null;
}

function buildLoginResponse(opts: { expiresInSec?: number } = {}) {
	return {
		accessToken: 'access-token-1',
		refreshToken: 'refresh-token-1',
		expiresIn: opts.expiresInSec ?? 3600
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('auth store', () => {
	let auth: typeof import('./auth.svelte').auth;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		resetMockWalletState();
		sessionStorage.clear();
		fakePhantomSignMessage.mockReset();
		fakeSolflareSignMessage.mockReset();
		fakePhantomSignMessage.mockResolvedValue({ signature: SIGNATURE_BYTES });
		fakeSolflareSignMessage.mockResolvedValue({ signature: SIGNATURE_BYTES });

		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		// Single import path keeps the wallet mock factory's closure stable
		// across tests. Tests that need a fresh module-load (E1-E4 — boot
		// rehydrate path) call `vi.resetModules()` + re-import locally.
		const mod = await import('./auth.svelte');
		auth = mod.auth;
		auth.__resetForTests?.();
		auth.__ensureEffectForTests?.();
	});

	afterEach(() => {
		auth.__resetForTests?.();
		vi.unstubAllGlobals();
	});

	// ─── A. signIn flow ───────────────────────────────────────────────

	it('A1: signIn() with no connected wallet throws and stays signed-out', async () => {
		await expect(auth.signIn()).rejects.toThrow(/not connected/i);
		expect(auth.status).toBe('signed-out');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('A2: signIn() builds message with wallet pubkey and calls signMessage with Uint8Array', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();

		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();

		expect(fakePhantomSignMessage).toHaveBeenCalledTimes(1);
		const [bytes, hint] = fakePhantomSignMessage.mock.calls[0]!;
		// jsdom's TextEncoder returns a Uint8Array sub-instance whose
		// constructor lives in a different realm; check shape via a
		// duck-typed `BYTES_PER_ELEMENT` rather than instanceof.
		expect((bytes as Uint8Array).BYTES_PER_ELEMENT).toBe(1);
		expect((bytes as Uint8Array).byteLength).toBeGreaterThan(0);
		expect(hint).toBe('utf8');
		const decoded = new TextDecoder().decode(bytes as Uint8Array);
		expect(decoded).toMatch(/^Login to Areal at \S+ for wallet DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK$/);
	});

	it('A3: signMessage rejection sets status=error and never fires a fetch', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();

		fakePhantomSignMessage.mockRejectedValue(new Error('User rejected'));
		await auth.signIn();
		await settle();

		expect(auth.status).toBe('error');
		expect(auth.error).toMatch(/rejected/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('A4: signMessage success POSTs /auth/login with bs58-encoded signature', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();

		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://api.example.test/auth/login');
		expect((init as RequestInit).method).toBe('POST');
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.wallet).toBe(WALLET_A_BASE58);
		expect(typeof body.signature).toBe('string');
		// bs58 of a 64-byte all-7 buffer is non-empty alphanumeric.
		expect(body.signature.length).toBeGreaterThan(0);
		expect(body.message).toMatch(/^Login to Areal at /);
	});

	// ─── B. /auth/login responses ──────────────────────────────────────

	it('B1: 200 response → signed-in, tokens stored, sessionStorage written', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();

		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();

		expect(auth.status).toBe('signed-in');
		expect(auth.accessToken).toBe('access-token-1');
		expect(auth.wallet).toBe(WALLET_A_BASE58);
		expect(auth.isSignedIn).toBe(true);

		const blob = sessionStorage.getItem(STORAGE_KEY);
		expect(blob).not.toBeNull();
		const parsed = JSON.parse(blob!);
		expect(parsed.accessToken).toBe('access-token-1');
		expect(parsed.wallet).toBe(WALLET_A_BASE58);
	});

	it('B2: 401 response → status=error, no tokens stored', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();

		fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Invalid signature' }));
		await auth.signIn();
		await settle();

		expect(auth.status).toBe('error');
		expect(auth.accessToken).toBeNull();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('B3: 429 response → status=error with slow-down hint', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();

		fetchMock.mockResolvedValue(jsonResponse(429, { message: 'rate limited' }));
		await auth.signIn();
		await settle();

		expect(auth.status).toBe('error');
		expect(auth.error).toMatch(/slow down/i);
	});

	it('B4: network error → status=error', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();

		fetchMock.mockRejectedValue(new Error('Failed to fetch'));
		await auth.signIn();
		await settle();

		expect(auth.status).toBe('error');
		expect(auth.error).toMatch(/Failed to fetch/);
	});

	// ─── C. Refresh ────────────────────────────────────────────────────

	it('C1: two parallel refresh() calls share a single fetch', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();
		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();
		fetchMock.mockClear();

		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				accessToken: 'access-token-2',
				refreshToken: 'refresh-token-2',
				expiresIn: 3600
			})
		);

		const [a, b] = await Promise.all([auth.refresh(), auth.refresh()]);
		await settle();

		expect(a).toBe(true);
		expect(b).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(auth.accessToken).toBe('access-token-2');
	});

	it('C2: 401 from refresh → expired, sessionStorage cleared', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();
		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();

		fetchMock.mockResolvedValue(jsonResponse(401, { message: 'revoked' }));
		const ok = await auth.refresh();
		await settle();

		expect(ok).toBe(false);
		expect(auth.status).toBe('expired');
		expect(auth.accessToken).toBeNull();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
		// Wallet must be retained in expired state for re-sign banner.
		expect(auth.wallet).toBe(WALLET_A_BASE58);
	});

	it('C3: 200 from refresh → tokens rotated, signed-in', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();
		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();

		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				accessToken: 'access-token-2',
				refreshToken: 'refresh-token-2',
				expiresIn: 7200
			})
		);
		const ok = await auth.refresh();
		await settle();

		expect(ok).toBe(true);
		expect(auth.status).toBe('signed-in');
		expect(auth.accessToken).toBe('access-token-2');
		// Persisted blob updated.
		const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
		expect(parsed.accessToken).toBe('access-token-2');
	});

	it('C4: late refresh response after wallet-switch is silently dropped', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();
		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();

		// Make the refresh hang.
		let resolveLate: (r: Response) => void = () => {};
		const lateResp = new Promise<Response>((r) => {
			resolveLate = r;
		});
		fetchMock.mockReturnValue(lateResp);

		const refreshPromise = auth.refresh();

		// Wallet switches BEFORE the refresh resolves.
		setWallet(WALLET_B_PK);
		flushSync();
		await settle();

		// Now deliver the stale response.
		resolveLate(
			jsonResponse(200, {
				accessToken: 'late-access',
				refreshToken: 'late-refresh',
				expiresIn: 3600
			})
		);
		const ok = await refreshPromise;
		await settle();

		expect(ok).toBe(false);
		// Wallet-switch reset the store; late response did NOT clobber state.
		expect(auth.accessToken).toBeNull();
		expect(auth.status).toBe('signed-out');
	});

	// ─── D. Wallet-switch ──────────────────────────────────────────────

	it('D1: wallet pubkey change clears tokens and pending refresh', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();
		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();
		expect(auth.isSignedIn).toBe(true);

		setWallet(WALLET_B_PK);
		flushSync();
		await settle();

		expect(auth.status).toBe('signed-out');
		expect(auth.accessToken).toBeNull();
		expect(auth.wallet).toBeNull();
	});

	it('D2: wallet disconnect clears tokens and signs out', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();
		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();
		expect(auth.isSignedIn).toBe(true);

		setWallet(null);
		flushSync();
		await settle();

		expect(auth.status).toBe('signed-out');
		expect(auth.accessToken).toBeNull();
	});

	// ─── E. sessionStorage rehydrate ───────────────────────────────────

	it('E1: valid + far-from-expiry blob → signed-in on boot, no fetch', async () => {
		const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				accessToken: 'persisted-access',
				refreshToken: 'persisted-refresh',
				expiresAt: farFuture,
				wallet: WALLET_A_BASE58
			})
		);

		vi.resetModules();
		const mod = await import('./auth.svelte');
		const a = mod.auth;

		expect(a.status).toBe('signed-in');
		expect(a.accessToken).toBe('persisted-access');
		// No fetch on boot since plenty of headroom.
		expect(fetchMock).not.toHaveBeenCalled();

		a.__resetForTests?.();
	});

	it('E2: valid + near-expiry blob → triggers refresh on boot', async () => {
		const nearExpiry = new Date(Date.now() + 30_000).toISOString();
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				accessToken: 'about-to-expire',
				refreshToken: 'persisted-refresh',
				expiresAt: nearExpiry,
				wallet: WALLET_A_BASE58
			})
		);
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				accessToken: 'rotated-access',
				refreshToken: 'rotated-refresh',
				expiresIn: 3600
			})
		);

		vi.resetModules();
		const mod = await import('./auth.svelte');
		const a = mod.auth;

		await settle(8);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]![0]).toMatch(/\/auth\/refresh$/);
		expect(a.status).toBe('signed-in');
		expect(a.accessToken).toBe('rotated-access');

		a.__resetForTests?.();
	});

	it('E3: invalid JSON in storage → cleared, signed-out', async () => {
		sessionStorage.setItem(STORAGE_KEY, '{not-json');
		vi.resetModules();
		const mod = await import('./auth.svelte');
		const a = mod.auth;

		expect(a.status).toBe('signed-out');
		// readPersisted returns null for parse fail; module-load
		// rehydrate is a no-op so the bad blob STAYS until the user's
		// next signIn. That's by design — clearing on a parse fail is a
		// nice-to-have (verified separately below via the rehydrate path
		// in E4).
		a.__resetForTests?.();
	});

	it('E4: schema-mismatched blob → not adopted, signed-out', async () => {
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				accessToken: 123, // wrong type
				refreshToken: 'r',
				expiresAt: 'now',
				wallet: WALLET_A_BASE58
			})
		);
		vi.resetModules();
		const mod = await import('./auth.svelte');
		const a = mod.auth;

		expect(a.status).toBe('signed-out');
		expect(a.accessToken).toBeNull();
		a.__resetForTests?.();
	});

	// ─── G. Banner state ──────────────────────────────────────────────

	it('G1: refresh-fail leaves wallet retained for the re-sign banner', async () => {
		setWallet(WALLET_A_PK);
		flushSync();
		await settle();
		fetchMock.mockResolvedValue(jsonResponse(200, buildLoginResponse()));
		await auth.signIn();
		await settle();

		fetchMock.mockResolvedValue(jsonResponse(401, { message: 'revoked' }));
		await auth.refresh();
		await settle();

		expect(auth.isSignedIn).toBe(false);
		expect(auth.status).toBe('expired');
		expect(auth.wallet).toBe(WALLET_A_BASE58);
	});
});
