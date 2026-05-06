<script lang="ts">
	import '$lib/styles/global.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui';
	import DebugStrip from '$lib/components/debug/DebugStrip.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<Toaster />
<DebugStrip />
