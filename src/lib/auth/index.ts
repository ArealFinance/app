/*
 * Public re-exports for the auth surface. Consumers import from
 * `$lib/auth` rather than the underlying `.svelte.ts` to keep the runes
 * file private to the store.
 */
export { auth, type AuthStatus, type AuthStore } from './auth.svelte';
export { buildLoginMessage, AUTH_LOGIN_MESSAGE_FORMAT_VERSION } from './messages';
export type { BuiltLoginMessage } from './messages';
