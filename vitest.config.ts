import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
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
  plugins: [svelte()],
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
      // SvelteKit virtual env modules — vitest doesn't load the sveltekit
      // plugin so we point the aliases at empty stubs that tests can
      // override via `vi.mock(...)` at the spec level.
      '$env/static/public': path.resolve('./src/test-stubs/env-static-public.ts'),
      '$env/static/private': path.resolve('./src/test-stubs/env-static-private.ts'),
      '$env/dynamic/public': path.resolve('./src/test-stubs/env-dynamic-public.ts'),
      '$env/dynamic/private': path.resolve('./src/test-stubs/env-dynamic-private.ts')
    },
    conditions: ['browser']
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