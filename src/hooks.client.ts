// Dev-mode globals shim for pre-bundled CJS deps (crypto-browserify, base-x,
// @solana/spl-token) reachable via @arlex/client/codegen-runtime. They
// reference `Buffer` / `process` / `global` at module top-level. The vite
// node-polyfill plugin keeps `globals.{Buffer,process,global}: false` because:
//   - Buffer/process: src/ doesn't import them, and resolving the plugin's
//     shim path inside transitively-installed deps' node_modules subtrees
//     fails on Vite 8 / Rolldown.
//   - global: enabling injection breaks engine.io-client's
//     esm-debug/globalThis.js shim resolution.
// Production tree-shakes these refs out via manualChunks; dev's pre-bundle
// path doesn't, so we attach minimal shims here. hooks.client.ts is the
// earliest user-controlled module SvelteKit evaluates on the client.
import { Buffer } from 'buffer';

// Cast through `unknown` so we don't fight the lib `Process` type — these
// shims live for pre-bundled CJS deps that just check `typeof process` and
// peek at `.browser` / `.env`. They never run on Node.
const w = window as unknown as {
	Buffer?: typeof Buffer;
	process?: { env: Record<string, string>; browser: boolean };
	global?: typeof globalThis;
};
w.Buffer ??= Buffer;
w.process ??= { env: {}, browser: true };
w.global ??= globalThis;
