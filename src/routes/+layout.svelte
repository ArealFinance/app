<script lang="ts">
	import '$lib/styles/global.css';
	// Browser-globals shim for transitively-loaded CJS deps that reach for
	// `window.Buffer` / `window.process` / `window.global` at module top-level
	// (notably `@arlex/client/codegen-runtime` calls `Buffer.concat` and
	// `data.readBigUInt64LE` on what it expects to be the `buffer` polyfill's
	// Buffer prototype). The vite node-polyfill plugin keeps `globals.*: false`
	// because injecting them globally trips Vite 8 / Rolldown's resolver inside
	// transitively-installed deps. We previously kept this shim in
	// `hooks.client.ts`, but its side-effect statements get tree-shaken in
	// some bundle layouts (the `client_hooks` import only references
	// `handleError`/`init`, so the rest of the module body can drop). Doing
	// the assignment here guarantees execution before any user route loads.
	import '$lib/runtime/browser-globals';
	import { dev } from '$app/environment';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui';

	let { children } = $props();

	/*
	 * DebugStrip pulls `$lib/sdk/reads.ts` → `@areal/sdk/rwt-engine` →
	 * `@solana/web3.js` into whatever chunk it lives in. Static-importing it
	 * from the layout would hoist that ~600 KB Solana stack onto every cold
	 * route load. Dev-gate via `dev` from `$app/environment` (a compile-time
	 * constant — `false` in production builds) so Vite tree-shakes the entire
	 * subgraph out of the prod bundle. Use a dynamic import inside the gate so
	 * the static import graph doesn't reach the SDK from the layout chunk.
	 */
	let DebugStripCmp: typeof import('$lib/components/debug/DebugStrip.svelte').default | null =
		$state(null);
	$effect(() => {
		if (dev && !DebugStripCmp) {
			void import('$lib/components/debug/DebugStrip.svelte').then((m) => {
				DebugStripCmp = m.default;
			});
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<Toaster />
{#if dev && DebugStripCmp}
	<DebugStripCmp />
{/if}
