/*
 * Login-message format for the Areal wallet-signature auth handshake.
 *
 * The exact format MUST match the backend's `AuthService.LOGIN_MESSAGE_RE`
 * (see `backend/src/modules/auth/auth.service.ts:295`):
 *
 *   /^Login to Areal at (\S+) (?:for wallet|from) ([1-9A-HJ-NP-Za-km-z]{32,44})\s*$/
 *
 * The backend accepts two variants — `for wallet <pk>` (Phase 5 precedent)
 * and `from <pk>` (older clients) — but new code should always emit the
 * `for wallet <pk>` form. The timestamp is ISO-8601 in UTC produced by
 * `Date#toISOString()`; the backend rejects messages whose timestamp is
 * more than `TIMESTAMP_SKEW_MS` from server clock.
 */

/**
 * Bumped if the format ever changes incompatibly. Persisted alongside the
 * built message so callers can flag stale cached messages and rebuild.
 */
export const AUTH_LOGIN_MESSAGE_FORMAT_VERSION = 1;

export interface BuiltLoginMessage {
	/** The full message string the wallet will be asked to sign. */
	message: string;
	/** The ISO-8601 timestamp embedded in the message (UTC). */
	timestamp: string;
}

/**
 * Build the login message for a given base58 wallet pubkey.
 *
 * @param wallet - base58-encoded Solana pubkey (32-44 chars)
 * @param now - optional fixed clock for tests; defaults to `new Date()`
 */
export function buildLoginMessage(wallet: string, now?: Date): BuiltLoginMessage {
	const timestamp = (now ?? new Date()).toISOString();
	const message = `Login to Areal at ${timestamp} for wallet ${wallet}`;
	return { message, timestamp };
}
