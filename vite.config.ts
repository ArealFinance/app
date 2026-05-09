import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		sveltekit(),
		nodePolyfills({
			include: ['buffer', 'crypto', 'stream', 'util', 'process'],
			// `Buffer: false` — disable the Inject pass entirely. @areal/sdk and
			// @arlex/client already `import { Buffer } from 'buffer'` explicitly,
			// so an automatic injector is redundant. Vite 8 / Rolldown can't
			// resolve the inject's `vite-plugin-node-polyfills/shims/buffer` path
			// from inside transitively-installed deps' node_modules subtrees.
			// `process: false` — W4 audit (2026-05-07): no app code under src/
			// references `process`, and @solana/web3.js's browser ESM bundle has
			// zero `process.` occurrences (only the Node-targeted ESM uses
			// `process.version` for an http-agent shim, which never runs in the
			// browser). Keeping the `process` shim importable via `include` for
			// any module that does `import process from 'process'` explicitly,
			// but skipping the global injector saves bundle weight and avoids
			// surprise globals. Re-audit if a new dep starts touching globals.
			// `global: false` — Phase 12.3.3 audit: enabling global injection
			// breaks engine.io-client (transitive of socket.io-client via the
			// realtime SDK). engine.io-client's `esm-debug/globalThis.js`
			// references `global` in a node-condition path, and the plugin's
			// inject pass cannot resolve `vite-plugin-node-polyfills/shims/global`
			// from inside `sdk/node_modules`. We don't actually need a `global`
			// global anywhere in app code — `globalThis` is universal.
			globals: { Buffer: false, global: false, process: false },
			overrides: { fs: 'empty' }
		})
	],
	optimizeDeps: {
		include: ['@solana/web3.js', 'bs58', 'buffer', '@areal/sdk', '@arlex/client']
	},
	// Dedupe so the app, @areal/sdk, and any transitively-installed copies all
	// share one PublicKey identity (and one Buffer class).
	resolve: {
		dedupe: ['@solana/web3.js', 'buffer']
	},
	// @solana/web3.js ships raw TypeScript that some bundler paths can't
	// transpile cleanly. The SDK and arlex-client both rely on the
	// node-polyfill Buffer being injected at the call site — we keep them
	// non-externalized so the polyfill transform can rewrite them.
	ssr: { noExternal: ['@solana/web3.js', '@areal/sdk', '@arlex/client'] },

	build: {
		rollupOptions: {
			output: {
				/*
				 * Pin the Solana stack into a stable `vendor-solana` chunk so:
				 *   1. Phase 25 deploys don't bust ~600 KB of cached vendor JS
				 *      every time an app source file changes.
				 *   2. Routes that don't transactively touch wallet/SDK code
				 *      (notably `/markets` cold load) don't preload it via
				 *      `<link rel="modulepreload">` from the layout chunk.
				 *
				 * The matcher targets `node_modules` paths AND the resolved
				 * `file:../sdk` workspace package (which lands as either
				 * `node_modules/@areal/sdk` or as a direct `/sdk/dist/` path
				 * after Rollup resolution). The `@arlex/client` tarball
				 * resolves to `node_modules/@arlex/client` regardless.
				 */
				manualChunks(id: string) {
					// Normalise to forward slashes for cross-platform matching.
					const norm = id.replace(/\\/g, '/');

					if (
						norm.includes('/node_modules/@solana/web3.js/') ||
						norm.includes('/node_modules/@areal/sdk/') ||
						norm.includes('/node_modules/@arlex/client/') ||
						// `file:../sdk` workspace dep — Rollup may resolve to the
						// source tree directly under `/sdk/dist/` or `/sdk/src/`.
						norm.includes('/sdk/dist/') ||
						norm.includes('/sdk/src/') ||
						norm.includes('/node_modules/tweetnacl/') ||
						norm.includes('/node_modules/bs58/') ||
						norm.includes('/node_modules/base-x/') ||
						norm.includes('/node_modules/bn.js/') ||
						norm.includes('/node_modules/elliptic/') ||
						norm.includes('/node_modules/secp256k1/') ||
						norm.includes('/node_modules/crypto-browserify/') ||
						norm.includes('/node_modules/buffer/') ||
						norm.includes('/node_modules/stream-browserify/')
					) {
						return 'vendor-solana';
					}

					/*
					 * Stable `vendor-svelte` chunk for runtime + Kit. These are
					 * present on every route and rarely change between deploys —
					 * pinning them isolates them from app-source churn so
					 * returning visitors keep cache hits across Phase 25 deploys.
					 */
					if (
						norm.includes('/node_modules/svelte/') ||
						norm.includes('/node_modules/@sveltejs/kit/')
					) {
						return 'vendor-svelte';
					}

					/*
					 * `vendor-d3` — d3 modules + layercake. Charts (PriceChart,
					 * VaultBubbleChart, AssetsDistributionChart, TickWheel) live
					 * on `/markets/[symbol]` and `/portfolio` only. Pinning these
					 * keeps `/markets` cold path free of chart code AND gives the
					 * detail pages a stable cached vendor chunk.
					 */
					if (
						norm.includes('/node_modules/d3-') ||
						norm.includes('/node_modules/layercake/')
					) {
						return 'vendor-d3';
					}

					return undefined;
				}
			}
		}
	}
});
