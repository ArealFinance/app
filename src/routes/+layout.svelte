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
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui';

	let { children } = $props();

	/*
	 * Header aurora only shows on `/markets` (and its sub-routes) and on the
	 * error / 404 page. Every other route slides the bloom out of view via a
	 * `transform: translateY(-1000px)` transition (defined on `.header-aurora`
	 * in `global.css`), so navigating to a non-markets page animates the bloom
	 * up off-screen and navigating back drops it down. The footer bloom is
	 * page-agnostic and lives on `<body>` directly.
	 */
	const showHeaderAurora = $derived.by(() => {
		const path = page.url?.pathname ?? '/';
		if (path === '/markets' || path.startsWith('/markets/')) return true;
		// `+error.svelte` mounts for any non-matched route; the page store's
		// `route.id` is null in that case. Treat null route as "error/404".
		if (page.route?.id === null) return true;
		return false;
	});

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

<!-- Header aurora — always in the DOM (one element, lifetime ==
  layout). Visibility is driven by a `.is-hidden` class that toggles
  a CSS transform/opacity transition. The element sits ABOVE the
  page content (z-index 2) with `pointer-events: none` and
  `mix-blend-mode: screen` so the dark parts of the bloom blend
  into the page below instead of occluding it — only the purple
  glow shows. This is the key trick that makes the slide-out
  visible: with z-index below content, the new page's hero would
  cover the aurora before the transform animation could play. -->
<div class="header-aurora" class:is-hidden={!showHeaderAurora} aria-hidden="true"></div>

{@render children()}

<Toaster />
{#if dev && DebugStripCmp}
	<DebugStripCmp />
{/if}
