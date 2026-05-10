// Node built-ins — `node:` prefix omitted because the project's
// `tsconfig.json` doesn't include `@types/node` (Vite config runs in Node,
// but the type-check pass treats `vite.config.ts` like a browser TS file).
// The bare specifiers resolve fine at Vite's node runtime.
import path from 'path';
import { fileURLToPath } from 'url';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type PluginOption, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { HttpsProxyAgent } from 'https-proxy-agent';
import https from 'https';
import http from 'http';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOPLEVEL_BUFFER = path.resolve(__dirname, 'node_modules/buffer');

/*
 * Outbound HTTPS proxy for the Vite dev proxy. Auto-picked from `HTTPS_PROXY`
 * / `https_proxy` shell vars (Node's `https` module ignores them by default,
 * unlike curl, so we wire the agent ourselves).
 *
 * Empirically required on dev machines that run Clash / Sing-Box in TUN
 * mode: those tools transparently intercept outbound TLS at the kernel
 * level and break the handshake to Cloudflare with
 * `decryption failed or bad record mac`. Routing through the explicit HTTP
 * proxy port (e.g. `127.0.0.1:7897`) bypasses the TUN intercept and
 * succeeds most of the time. Set `VITE_NO_HTTPS_PROXY=1` to opt out on
 * machines where the proxy makes things worse than a direct connection.
 */
const httpsProxyOptOut = process.env.VITE_NO_HTTPS_PROXY === '1';
const httpsProxyEnv = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? null;
const httpsProxyAgent =
	!httpsProxyOptOut && httpsProxyEnv ? new HttpsProxyAgent(httpsProxyEnv) : undefined;

/*
 * Custom dev proxy with retry-on-TLS-error.
 *
 * Vite's built-in `server.proxy` (http-proxy under the hood) doesn't survive
 * the Clash / Sing-Box TLS-flake pattern: the upstream connection sometimes
 * fails the handshake (`Client network socket disconnected before secure
 * TLS connection was established`) and Vite's internal `error` listener
 * writes `502 Bad Gateway` to the response *before* any user-installed
 * listener can react. `removeAllListeners('error')` from `configure()` is
 * also useless because Vite re-attaches its listener after configure runs.
 *
 * This middleware bypasses http-proxy entirely. It uses Node's built-in
 * `https` (with our `httpsProxyAgent` when configured) to issue the
 * upstream request, retries the request up to MAX_RETRIES on a TLS-handshake
 * error, and only writes a real 502 to the browser if every attempt fails.
 */
const UPSTREAM_HOST = 'api.areal.finance';
const UPSTREAM_PROTO = 'https:';
const MAX_RETRIES = 5;
/** Paths that should be proxied to the Areal backend. */
const PROXY_PATHS = ['/auth/', '/portfolio/', '/markets/', '/socket.io/'];

function shouldProxy(req: http.IncomingMessage): boolean {
	const url = req.url ?? '';
	if (!PROXY_PATHS.some((p) => url === p.slice(0, -1) || url.startsWith(p))) return false;
	// `/markets` and `/portfolio` collide with SvelteKit page routes. When the
	// browser navigates (Accept: text/html), let SvelteKit serve the page;
	// fetch/XHR requests carry application/json and fall through to us.
	const accept = req.headers.accept ?? '';
	if (accept.includes('text/html')) return false;
	// Socket.IO upgrades happen on the underlying server.upgrade — this
	// middleware only sees plain HTTP polls, which we don't proxy because
	// the realtime gateway path is non-critical for dev.
	return true;
}

function readRequestBody(req: http.IncomingMessage): Promise<Buffer | null> {
	if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(null);
	return new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		req.on('data', (c: Uint8Array) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks)));
		req.on('error', reject);
	});
}

function isRetryableError(err: NodeJS.ErrnoException): boolean {
	const m = err.message ?? '';
	return (
		m.includes('TLS') ||
		m.includes('socket disconnected') ||
		m.includes('ECONNRESET') ||
		m.includes('decryption failed') ||
		err.code === 'ECONNRESET' ||
		err.code === 'EPIPE' ||
		err.code === 'ETIMEDOUT'
	);
}

async function proxyOnce(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	body: Buffer | null
): Promise<void> {
	return new Promise((resolve, reject) => {
		const opts: https.RequestOptions = {
			protocol: UPSTREAM_PROTO,
			hostname: UPSTREAM_HOST,
			path: req.url,
			method: req.method,
			headers: {
				...req.headers,
				host: UPSTREAM_HOST
			},
			agent: httpsProxyAgent ?? undefined
		};
		// Node strips `connection: keep-alive` when the agent is reused; nothing
		// to do here.
		const upstream = https.request(opts, (upRes) => {
			res.writeHead(upRes.statusCode ?? 502, upRes.headers);
			upRes.pipe(res);
			upRes.on('end', () => resolve());
			upRes.on('error', reject);
		});
		upstream.on('error', reject);
		if (body) Readable.from(body).pipe(upstream);
		else upstream.end();
	});
}

async function handleProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
	const body = await readRequestBody(req);
	let lastErr: NodeJS.ErrnoException | null = null;
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			await proxyOnce(req, res, body);
			return;
		} catch (err) {
			const e = err as NodeJS.ErrnoException;
			lastErr = e;
			if (res.headersSent) {
				// Stream started — can't retry, the client already got bytes.
				console.warn(`[dev-proxy] mid-response error on ${req.url}: ${e.message}`);
				try {
					res.destroy();
				} catch {
					/* noop */
				}
				return;
			}
			if (!isRetryableError(e) || attempt === MAX_RETRIES) break;
			console.warn(
				`[dev-proxy] retry ${attempt}/${MAX_RETRIES} ${req.url}: ${e.message}`
			);
			await new Promise((r) => setTimeout(r, 100 * attempt));
		}
	}
	if (!res.headersSent) {
		res.writeHead(502, { 'content-type': 'text/plain' });
		res.end(`Bad Gateway: ${lastErr?.message ?? 'unknown'}`);
	}
}

function arealDevProxy(): PluginOption {
	return {
		name: 'areal-dev-proxy',
		configureServer(server: ViteDevServer) {
			server.middlewares.use((req, res, next) => {
				// Vite types `req` as Connect.IncomingMessage which is structurally
				// a subset of http.IncomingMessage at runtime but missing several
				// properties in its declared type. Cast to the runtime shape.
				const reqHttp = req as unknown as http.IncomingMessage;
				if (!shouldProxy(reqHttp)) return next();
				handleProxy(reqHttp, res).catch((err) => {
					console.error('[dev-proxy] handler crashed', err);
					if (!res.headersSent) {
						res.writeHead(500, { 'content-type': 'text/plain' });
						res.end('Internal Proxy Error');
					}
				});
			});
		}
	};
}

export default defineConfig({
	plugins: [
		arealDevProxy(),
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
			/*
			 * `buffer` override: pin imports of `buffer` to our top-level
			 * `buffer@6.0.3` instead of the v5.7.1 nested copy that
			 * `node-stdlib-browser` (this plugin's own transitive dep) ships.
			 * v5 lacks `readBig{U,}Int64{LE,BE}` — anything deserialising u64 /
			 * i64 fields (notably `@arlex/client/codegen-runtime`'s u64 reader)
			 * crashes at runtime with "data.readBigUInt64LE is not a function".
			 * The plugin's own `overrides` map runs ahead of its node-stdlib
			 * defaults, so the override wins regardless of the resolution
			 * order Vite picks. `fs: 'empty'` retained for the existing
			 * @solana/web3.js node-only path.
			 */
			overrides: { buffer: TOPLEVEL_BUFFER, fs: 'empty' }
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
		// `buffer` override is wired through `nodePolyfills.overrides` above —
		// see comment there for the v5 → v6 BigInt-method gap.
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
