<script lang="ts">
	import { onMount } from 'svelte';
	import { network } from '$lib/network';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { readNavBookValue, type NavBookValueSnapshot } from '$lib/sdk';

	/*
	 * Phase 5 smoke read.
	 *
	 * Mounted in `+layout.svelte` and gated by:
	 *   - `import.meta.env.DEV` — visible in `npm run dev`
	 *   - `?debug=1` query string — visible in any build
	 *
	 * Refetches on network change. Doesn't poll — explicit refresh button keeps
	 * the read deliberate (cheaper on RPC providers, easier to reason about).
	 */

	let visible = $state(false);
	let snapshot: NavBookValueSnapshot | null = $state(null);
	let error: string | null = $state(null);
	let loading = $state(false);

	// `?debug=1` toggle — only meaningful client-side, hence the onMount guard.
	onMount(() => {
		if (import.meta.env.DEV) {
			visible = true;
			return;
		}
		const params = new URLSearchParams(window.location.search);
		visible = params.has('debug');
	});

	async function refresh() {
		if (!visible) return;
		loading = true;
		error = null;
		try {
			snapshot = await readNavBookValue(wallet.connection, network.endpoint.programIds);
		} catch (err) {
			snapshot = null;
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	// Refetch on network change (and on initial mount once `visible` flips on).
	$effect(() => {
		// touch dependencies so $effect re-runs
		void network.current;
		if (visible) refresh();
	});
</script>

{#if visible}
	<div class="debug-strip" role="status" aria-live="polite">
		<span class="debug-net">{network.label}</span>
		<span class="debug-sep">·</span>
		{#if loading}
			<span>loading…</span>
		{:else if snapshot}
			<span>slot {snapshot.slot}</span>
			<span class="debug-sep">·</span>
			<span>NAV {snapshot.navBookValue.toString()}</span>
		{:else if error}
			<span class="debug-error">{error}</span>
		{:else}
			<span>no vault</span>
		{/if}
		<button type="button" class="debug-refresh" onclick={refresh} aria-label="Refresh">↻</button>
	</div>
{/if}

<style>
	.debug-strip {
		position: fixed;
		bottom: 6px;
		right: 6px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		font: 11px ui-monospace, 'SF Mono', Menlo, monospace;
		color: #7fff7f;
		background: rgba(0, 0, 0, 0.75);
		border: 1px solid rgba(127, 255, 127, 0.2);
		border-radius: 4px;
		z-index: 9999;
		pointer-events: auto;
	}
	.debug-net {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-weight: 600;
	}
	.debug-sep {
		opacity: 0.5;
	}
	.debug-error {
		color: #ff7f7f;
	}
	.debug-refresh {
		background: transparent;
		border: 0;
		color: inherit;
		font: inherit;
		padding: 0 4px;
		cursor: pointer;
		opacity: 0.7;
	}
	.debug-refresh:hover {
		opacity: 1;
	}
</style>
