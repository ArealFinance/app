<script lang="ts">
	import { ENDPOINTS, SELECTABLE_NETWORK_IDS, network, type NetworkId } from '$lib/network';

	type Props = {
		/** Visual variant — `chip` for header, `row` for the mobile wallet panel. */
		variant?: 'chip' | 'row';
	};

	let { variant = 'chip' }: Props = $props();

	const current = $derived(network.current);
	const label = $derived(ENDPOINTS[current].label);

	function handleChange(event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		network.setNetwork(target.value as NetworkId);
	}
</script>

<label class="network-switcher" class:variant-chip={variant === 'chip'} class:variant-row={variant === 'row'}>
	<span class="visually-hidden">Network</span>
	<span class="network-dot" aria-hidden="true"></span>
	<select class="network-select" aria-label="Active network" value={current} onchange={handleChange}>
		{#each SELECTABLE_NETWORK_IDS as id}
			<option value={id}>{ENDPOINTS[id].label}</option>
		{/each}
	</select>
	<span class="network-label" aria-hidden="true">{label}</span>
</label>

<style>
	.network-switcher {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		user-select: none;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.network-dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background-color: var(--color-green-900);
		box-shadow: 0 0 6px 2px rgba(115, 255, 131, 0.4);
		flex-shrink: 0;
	}

	/* Native select sits on top, transparent — gives us free a11y, keyboard
	 * navigation, and platform-native dropdown. The visible label below is the
	 * styled "facade" that absorbs the actual visual treatment. */
	.network-select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		font: inherit;
	}

	.network-label {
		font-family: var(--font-body);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 1px;
		text-transform: uppercase;
		color: var(--color-purple-200);
	}

	/* Chip variant — compact pill suitable for the header. */
	.network-switcher.variant-chip {
		height: 32px;
		padding: 0 var(--space-3);
		background-color: rgba(0, 0, 0, 0.3);
		border-radius: var(--radius-md);
	}

	/* Row variant — full-width row for the mobile wallet panel. */
	.network-switcher.variant-row {
		width: 100%;
		justify-content: space-between;
		height: 40px;
		padding: 0 var(--space-3);
		background-color: rgba(0, 0, 0, 0.3);
		border-radius: var(--radius-md);
	}
	.network-switcher.variant-row .network-label {
		font-size: var(--text-sm);
	}
</style>
