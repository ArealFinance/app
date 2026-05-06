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
			globals: { Buffer: false, global: true, process: true },
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
	ssr: { noExternal: ['@solana/web3.js', '@areal/sdk', '@arlex/client'] }
});
