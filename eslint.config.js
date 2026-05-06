/*
 * ESLint flat config for Vite 8 + SvelteKit 2 + Svelte 5.
 *
 * Minimal scope: only enforces rules that catch real production bugs the
 * compiler doesn't. Style/formatting concerns are left to the editor.
 *
 * Key rule: `no-restricted-globals` blocks bare `Buffer.X` references.
 * `vite-plugin-node-polyfills` is configured with `Buffer: false`, so any
 * code that touches the global `Buffer` will throw at runtime in the
 * browser. The fix is to `import { Buffer } from "buffer"` explicitly.
 *
 * Pre-existing Svelte/TS warnings (each-block keys, navigation resolve,
 * unused vars) are intentionally kept as warnings rather than errors —
 * cleaning them up is out of scope for this Phase 5 follow-up. The build
 * is not gated on lint.
 */
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

const restrictedGlobalsRule = [
	'error',
	{
		name: 'Buffer',
		message:
			'Bare `Buffer` is not polyfilled in browser builds (vite-plugin-node-polyfills `Buffer: false`). Use `import { Buffer } from "buffer"` instead.'
	}
];

// Pre-existing Svelte issues that are out of scope for Phase 5 follow-ups.
// These are real lint findings worth a follow-up pass, but kept as warnings
// here so the lint command stays green for the rule we actually care about.
const svelteLegacyDowngrades = {
	'svelte/no-navigation-without-resolve': 'warn',
	'svelte/require-each-key': 'warn',
	'svelte/prefer-svelte-reactivity': 'warn'
};

export default [
	js.configs.recommended,
	...ts.configs.recommended,

	// Browser code (default).
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.es2022
			}
		},
		rules: {
			'no-restricted-globals': restrictedGlobalsRule,
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
		}
	},

	// Svelte components — same restrictions, plus Svelte plugin recommended.
	...svelte.configs['flat/recommended'].map((config) => ({
		...config,
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			...config.languageOptions,
			parser: svelteParser,
			parserOptions: {
				...(config.languageOptions?.parserOptions ?? {}),
				parser: ts.parser,
				extraFileExtensions: ['.svelte']
			},
			globals: {
				...globals.browser,
				...globals.es2022
			}
		},
		rules: {
			...(config.rules ?? {}),
			...svelteLegacyDowngrades,
			'no-restricted-globals': restrictedGlobalsRule
		}
	})),

	// Test files — Node globals (Buffer is fine in jsdom/node test context).
	{
		files: ['**/*.test.ts', '**/*.spec.ts', '**/test-setup.ts', '**/*.stories.svelte'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2022
			}
		},
		rules: {
			'no-restricted-globals': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'prefer-const': 'warn'
		}
	},

	// Node scripts and config files.
	{
		files: ['scripts/**/*.{js,mjs,ts}', '*.config.{js,ts,mjs}', '.storybook/**/*.{js,ts}'],
		languageOptions: {
			globals: {
				...globals.node,
				...globals.es2022
			}
		},
		rules: {
			'no-restricted-globals': 'off'
		}
	},

	// Ignored paths.
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'storybook-static/',
			'node_modules/',
			'static/',
			'plan/',
			'**/*.d.ts'
		]
	}
];
