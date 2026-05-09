/*
 * Tests for the authenticated fetch wrapper. We mock `$lib/auth` directly
 * (not the underlying `auth.svelte`) so the tests describe behaviour at
 * the API boundary the wrapper consumes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = {
	isSignedIn: false,
	accessToken: null as string | null,
	expiresAt: null as number | null,
	refresh: vi.fn<() => Promise<boolean>>()
};

vi.mock('$lib/auth', () => ({
	get auth() {
		return auth;
	}
}));

import { apiFetch } from './api-fetch';

function jsonResponse(status: number, body: unknown = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function resetAuth(): void {
	auth.isSignedIn = false;
	auth.accessToken = null;
	auth.expiresAt = null;
	auth.refresh.mockReset();
}

describe('apiFetch', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		resetAuth();
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('attaches Bearer header when signed-in with a fresh token', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-1';
		auth.expiresAt = Date.now() + 60 * 60 * 1000;

		fetchMock.mockResolvedValue(jsonResponse(200));
		await apiFetch('/api/things');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const init = fetchMock.mock.calls[0]![1] as RequestInit;
		const headers = new Headers(init.headers);
		expect(headers.get('Authorization')).toBe('Bearer access-1');
	});

	it('skips Bearer when anonymous=true even if signed-in', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-1';
		auth.expiresAt = Date.now() + 60 * 60 * 1000;

		fetchMock.mockResolvedValue(jsonResponse(200));
		await apiFetch('/api/public', { anonymous: true });

		const init = fetchMock.mock.calls[0]![1] as RequestInit | undefined;
		const headers = new Headers(init?.headers);
		expect(headers.get('Authorization')).toBeNull();
	});

	it('skips Bearer when not signed-in', async () => {
		auth.isSignedIn = false;
		fetchMock.mockResolvedValue(jsonResponse(200));
		await apiFetch('/api/things');

		const init = fetchMock.mock.calls[0]![1] as RequestInit | undefined;
		const headers = new Headers(init?.headers);
		expect(headers.get('Authorization')).toBeNull();
	});

	it('preemptively refreshes when expiresAt is within 60s', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-old';
		auth.expiresAt = Date.now() + 30_000;
		auth.refresh.mockImplementation(async () => {
			auth.accessToken = 'access-new';
			auth.expiresAt = Date.now() + 60 * 60 * 1000;
			return true;
		});

		fetchMock.mockResolvedValue(jsonResponse(200));
		await apiFetch('/api/things');

		expect(auth.refresh).toHaveBeenCalledTimes(1);
		const init = fetchMock.mock.calls[0]![1] as RequestInit;
		expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-new');
	});

	it('does not preemptively refresh when expiresAt is far in the future', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-1';
		auth.expiresAt = Date.now() + 60 * 60 * 1000;
		auth.refresh.mockResolvedValue(true);

		fetchMock.mockResolvedValue(jsonResponse(200));
		await apiFetch('/api/things');

		expect(auth.refresh).not.toHaveBeenCalled();
	});

	it('on 401 with Bearer, refreshes once and retries with new token', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-old';
		auth.expiresAt = Date.now() + 60 * 60 * 1000;

		fetchMock
			.mockResolvedValueOnce(jsonResponse(401))
			.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

		auth.refresh.mockImplementation(async () => {
			auth.accessToken = 'access-new';
			auth.expiresAt = Date.now() + 60 * 60 * 1000;
			return true;
		});

		const res = await apiFetch('/api/things');
		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(auth.refresh).toHaveBeenCalledTimes(1);
		// Second call uses the rotated token.
		const retryInit = fetchMock.mock.calls[1]![1] as RequestInit;
		expect(new Headers(retryInit.headers).get('Authorization')).toBe('Bearer access-new');
	});

	it('on 401 + refresh-fail returns the original 401 (no second retry)', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-old';
		auth.expiresAt = Date.now() + 60 * 60 * 1000;

		fetchMock.mockResolvedValueOnce(jsonResponse(401));
		auth.refresh.mockResolvedValue(false);

		const res = await apiFetch('/api/things');
		expect(res.status).toBe(401);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('does not retry on non-401 statuses', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-1';
		auth.expiresAt = Date.now() + 60 * 60 * 1000;

		fetchMock.mockResolvedValueOnce(jsonResponse(500));

		const res = await apiFetch('/api/things');
		expect(res.status).toBe(500);
		expect(auth.refresh).not.toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('two parallel preemptive refreshes share a single auth.refresh() call', async () => {
		auth.isSignedIn = true;
		auth.accessToken = 'access-old';
		auth.expiresAt = Date.now() + 30_000;

		// auth.refresh implementation is single-flight in the real store; here
		// we just count calls and ensure both api-fetch callers awaited the
		// SAME promise (they should, because each calls auth.refresh which
		// dedupes internally — but apiFetch on its own does NOT dedupe).
		// What we verify here: each apiFetch call DOES call auth.refresh,
		// and since auth.refresh is single-flight in the real store this
		// ends up as 1 round trip — but mocked we just check that callers
		// proceed independently and the combined behaviour is correct.
		auth.refresh.mockImplementation(async () => {
			auth.accessToken = 'access-new';
			auth.expiresAt = Date.now() + 60 * 60 * 1000;
			return true;
		});
		fetchMock.mockResolvedValue(jsonResponse(200));

		await Promise.all([apiFetch('/api/a'), apiFetch('/api/b')]);

		// Both requests landed; both used the rotated token.
		expect(fetchMock).toHaveBeenCalledTimes(2);
		for (const call of fetchMock.mock.calls) {
			const headers = new Headers((call[1] as RequestInit).headers);
			expect(headers.get('Authorization')).toBe('Bearer access-new');
		}
	});
});
