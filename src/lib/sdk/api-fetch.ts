/*
 * Authenticated `fetch` wrapper.
 *
 * Two responsibilities:
 *
 *   1. Attach `Authorization: Bearer <access-token>` to outgoing requests
 *      when the auth store is signed-in. Callers that hit public endpoints
 *      can opt out via `{ anonymous: true }`.
 *
 *   2. Preemptive refresh: when the cached access token is within
 *      REFRESH_THRESHOLD_MS of its expiry we kick a single-flight refresh
 *      BEFORE sending the request. This avoids a guaranteed-to-fail round
 *      trip and the expired-token-in-flight race.
 *
 *   3. Reactive 401 retry: if the request lands with the bearer header but
 *      comes back 401 (token revoked between preemptive check and arrival),
 *      we run a refresh + ONE retry. No second retry — repeated 401s mean
 *      the session is dead and the user must re-sign.
 *
 * Single-flight behaviour is provided by the auth store's `refresh()`
 * implementation, so concurrent api-fetch calls share one refresh round
 * trip (matches the architect's F1/F2 invariants).
 */
import { auth, REFRESH_THRESHOLD_MS } from '$lib/auth';

export interface AuthedFetchOptions extends RequestInit {
	/**
	 * Skip token attachment and 401 retry. Use for genuinely public endpoints
	 * (login, refresh, market reads) so a stale token can't poison them.
	 */
	anonymous?: boolean;
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
	const headers = new Headers(init?.headers);
	headers.set('Authorization', `Bearer ${token}`);
	return { ...init, headers };
}

export async function apiFetch(
	input: string | URL,
	init: AuthedFetchOptions = {}
): Promise<Response> {
	const { anonymous, ...rest } = init;

	if (anonymous || !auth.isSignedIn) {
		return fetch(input, rest);
	}

	// Preemptive refresh — avoid sending a guaranteed-to-fail request.
	const exp = auth.expiresAt;
	if (exp !== null && exp - Date.now() < REFRESH_THRESHOLD_MS) {
		await auth.refresh();
		// auth.refresh() updates the access token in-place; on failure
		// `isSignedIn` flips to false and we fall through to anonymous mode.
		if (!auth.isSignedIn) {
			return fetch(input, rest);
		}
	}

	const token = auth.accessToken;
	if (!token) {
		// Race: refresh dropped us between the check and now.
		return fetch(input, rest);
	}

	const first = await fetch(input, withBearer(rest, token));
	if (first.status !== 401) return first;

	// Reactive refresh on 401, then one retry.
	const ok = await auth.refresh();
	if (!ok) return first;

	const fresh = auth.accessToken;
	if (!fresh) return first;

	return fetch(input, withBearer(rest, fresh));
}
