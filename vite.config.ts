import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		sveltekit(),
		nodePolyfills({
			include: ['buffer', 'crypto', 'stream', 'util', 'process'],
			// Buffer: 'build' (not `true`) avoids the Inject pass at build time,
			// which conflicts with @areal/sdk that imports Buffer explicitly.
			globals: { Buffer: 'build', global: true, process: true },
			overrides: { fs: 'empty' }
		})
	],
	optimizeDeps: {
		include: ['@solana/web3.js', 'bs58', 'buffer']
	},
	// Dedupe so the app, @areal/sdk, and any transitively-installed copies all
	// share one PublicKey identity (and one Buffer class).
	resolve: {
		dedupe: ['@solana/web3.js', 'buffer']
	},
	// @solana/web3.js ships raw TypeScript that some bundler paths can't
	// transpile cleanly. Force it through the standard CJS bundle.
	ssr: { noExternal: ['@solana/web3.js'] }
});
