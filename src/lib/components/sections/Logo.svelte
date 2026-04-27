<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	type Props = {
		/** Height in pixels. Width scales to preserve 117:24 aspect ratio (~4.875:1). */
		height?: number;
		hideWordmark?: boolean;
	} & Omit<HTMLAnchorAttributes, 'children'>;

	let {
		height = 24,
		hideWordmark = false,
		href = '/',
		class: className = '',
		...rest
	}: Props = $props();
</script>

<a {href} class="logo {className}" aria-label="Areal — home" {...rest}>
	{#if hideWordmark}
		<!-- Mark-only: clip the SVG to the leftmost 24px square via object-fit. -->
		<img
			class="logo-mark-only"
			src="/images/logo-areal.svg"
			alt=""
			style:height="{height}px"
			style:width="{height}px"
			aria-hidden="true"
		/>
	{:else}
		<img
			class="logo-full"
			src="/images/logo-areal.svg"
			alt="Areal"
			style:height="{height}px"
		/>
	{/if}
</a>

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
		color: var(--color-text);
	}

	.logo-full {
		display: block;
		width: auto;
	}

	.logo-mark-only {
		display: block;
		object-fit: cover;
		object-position: left center;
	}
</style>
