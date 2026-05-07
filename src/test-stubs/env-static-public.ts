/*
 * Test-only stub for `$env/static/public`.
 *
 * The vitest config aliases this path to provide a resolvable module — real
 * SvelteKit handles it via the `sveltekit()` plugin which we don't load in
 * tests. Specs that want a non-empty value should `vi.mock('$env/static/public', ...)`.
 */
export const PUBLIC_PROOF_STORE_URL = '';
export const PUBLIC_API_BASE_URL = '';
