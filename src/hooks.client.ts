/*
 * Browser-globals shim moved to `src/lib/runtime/browser-globals.ts`,
 * imported from `+layout.svelte`. SvelteKit imports this `hooks.client.ts`
 * as a namespace (`import * as client_hooks from '…'`) and only ever
 * references the `handleError` / `init` exports — Vite + Rolldown can
 * tree-shake the rest of the module body, dropping any side-effect
 * assignments here from the production bundle. The layout import path
 * is mandatory for every route, so the new location guarantees the
 * shim runs.
 */
export {};
