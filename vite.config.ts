import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { HttpsProxyAgent } from 'https-proxy-agent';

/*
 * Optional outbound HTTPS proxy for the Vite dev proxy. Honoured only when
 * `HTTPS_PROXY` (or `https_proxy`) is set in the developer's shell — required
 * on machines that route outbound traffic through Clash / Sing-Box / similar
 * (Node's built-in https module ignores `HTTPS_PROXY` by default, unlike
 * curl, which is why `npm run dev` previously hung with "Client network
 * socket disconnected before secure TLS connection" while curl to the same
 * host worked fine). Falls back to `undefined` when no proxy is configured,
 * which means the Vite proxy makes a direct connection — same as before.
 */
const httpsProxyEnv = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null;
const httpsProxyAgent = httpsProxyEnv ? new HttpsProxyAgent(httpsProxyEnv) : undefined;

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
	// Static text replacement for bare `global` references inside pre-bundled
	// CommonJS deps (crypto-browserify, base-x, etc.) reachable via
	// @arlex/client/codegen-runtime. The `nodePolyfills` plugin keeps
	// `globals.global: false` (engine.io-client conflict — see plugin block),
	// so we substitute at bundle-time instead. `globalThis` is universal in
	// every browser since 2020, so the replacement is safe.
	define: {
		global: 'globalThis'
	},
	// Dedupe so the app, @areal/sdk, and any transitively-installed copies all
	// share one PublicKey identity (and one Buffer class).
	resolve: {
		dedupe: ['@solana/web3.js', 'buffer']
	},
	/*
	 * Dev proxy — forwards Areal backend paths from `localhost:5173` to the
	 * production API at `api.areal.finance`. Without this, `/auth/login` and
	 * friends hit the absolute https URL and are blocked by the Cloudflare
	 * Transform Rule that pins `Access-Control-Allow-Origin` to the deployed
	 * hostnames (`app.areal.finance`, `panel.areal.finance`, etc.) — local
	 * dev origins are never in that allowlist, so the browser CORS-blocks.
	 *
	 * `endpoints.ts` flips `backendApiUrl` / `realtimeWsUrl` to the current
	 * dev origin in `import.meta.env.DEV`, so app code fetches to the dev
	 * server, which proxies upstream as the same origin (CORS off the
	 * picture entirely). `ws: true` enables Socket.IO WebSocket upgrade.
	 *
	 * `/markets` and `/portfolio` collide with SvelteKit page routes (the
	 * pages live at /markets and /portfolio). The `bypass` function returns
	 * the original URL untouched when the browser is navigating (Accept:
	 * text/html), so SvelteKit serves the page; fetch/XHR requests (which
	 * carry Accept: application/json) fall through to the proxy.
	 */
	server: {
		proxy: {
			'/auth': {
				target: 'https://api.areal.finance',
				changeOrigin: true,
				secure: true,
				agent: httpsProxyAgent
			},
			'/portfolio': {
				target: 'https://api.areal.finance',
				changeOrigin: true,
				secure: true,
				agent: httpsProxyAgent,
				bypass: (req) =>
					req.headers.accept?.includes('text/html') ? (req.url ?? false) : undefined
			},
			'/markets': {
				target: 'https://api.areal.finance',
				changeOrigin: true,
				secure: true,
				agent: httpsProxyAgent,
				bypass: (req) =>
					req.headers.accept?.includes('text/html') ? (req.url ?? false) : undefined
			},
			'/socket.io': {
				target: 'https://api.areal.finance',
				changeOrigin: true,
				secure: true,
				agent: httpsProxyAgent,
				ws: true
			}
		}
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
