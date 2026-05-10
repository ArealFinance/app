/*
 * Browser-globals shim — runs before any route component on the client side.
 *
 * Why we need this:
 *   - `@arlex/client/codegen-runtime.mjs` references `Buffer` (no import) at
 *     the module top level (`Buffer.concat`, `Buffer.alloc`, and inside the
 *     u64/u128 deserializers via `data.readBigUInt64LE`). The dist bundle
 *     was authored expecting a Node runtime or a bundler that auto-injects
 *     a `Buffer` global. Our Vite config keeps `globals.Buffer: false`
 *     because Vite 8 / Rolldown can't resolve the inject-pass shim from
 *     inside transitively-installed `node_modules` subtrees (see
 *     `vite.config.ts`).
 *
 *   - `process.browser` / `process.env` are read by some pre-bundled CJS
 *     deps (crypto-browserify, base-x) before they error on the missing
 *     property. A `{ env: {}, browser: true }` placeholder satisfies them.
 *
 *   - `global` is occasionally referenced by engine.io-client style shims
 *     in the realtime SDK transitive graph; pointing it at `globalThis`
 *     keeps them happy.
 *
 * Why here and not in `hooks.client.ts`:
 *   - SvelteKit imports `hooks.client.ts` as a NAMESPACE
 *     (`import * as client_hooks from '...'`) and only references the
 *     `handleError` / `init` exports. Some bundle layouts (Vite + Rolldown
 *     in particular) tree-shake the rest of the module body when no other
 *     name is read — so the global assignments in hooks.client.ts can drop
 *     out of the production graph entirely.
 *   - Importing this side-effect-only module from `+layout.svelte` (which
 *     IS evaluated for every route) guarantees the assignments run before
 *     any user code touches the SDK.
 */
import { Buffer } from 'buffer';

const w = globalThis as unknown as {
	Buffer?: typeof Buffer;
	process?: { env: Record<string, string>; browser: boolean };
	global?: typeof globalThis;
};

w.Buffer ??= Buffer;
w.process ??= { env: {}, browser: true };
w.global ??= globalThis;
