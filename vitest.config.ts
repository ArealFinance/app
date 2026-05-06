import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';

/*
 * Tests run with vite-plugin-svelte (no SvelteKit runtime needed for primitives).
 * Component tests use @testing-library/svelte; pure-fn tests are plain TS.
 */
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [
    svelte(),
    // Polyfills required for @solana/web3.js / @areal/sdk inside jsdom tests.
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'process'],
      globals: { Buffer: 'build', global: true, process: true },
      overrides: { fs: 'empty' }
    })
  ],
  optimizeDeps: {
    include: ['@solana/web3.js', 'bs58', 'buffer']
  },
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib')
    },
    conditions: ['browser'],
    // Dedupe @solana/web3.js so spies on PublicKey statics intercept calls
    // made inside the SDK. Dedupe `buffer` so the polyfill's Buffer class
    // matches the one Buffer.from(...) reaches for.
    dedupe: ['@solana/web3.js', 'buffer']
  },
  test: {
    projects: [{
      extends: true,
      test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test-setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,js}'],
        css: true,
        server: {
          deps: {
            inline: [/svelte/]
          }
        }
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});