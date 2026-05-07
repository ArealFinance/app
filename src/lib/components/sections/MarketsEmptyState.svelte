<script lang="ts" module>
	export type MarketsEmptyStateVariant = 'mainnet-coming-soon' | 'no-pools' | 'no-token';
</script>

<script lang="ts">
	type Props = {
		variant?: MarketsEmptyStateVariant;
		/** Override the default copy for the variant. Optional. */
		message?: string;
	};

	let { variant = 'no-pools', message }: Props = $props();

	const DEFAULT_MESSAGES: Record<MarketsEmptyStateVariant, { title: string; sub: string }> = {
		'mainnet-coming-soon': {
			title: 'Mainnet pools coming soon',
			sub: 'Switch to Devnet to see live data, or check back closer to launch.'
		},
		'no-pools': {
			title: 'No pools available',
			sub: 'There are no liquidity pools for this network yet.'
		},
		'no-token': {
			title: 'Token not found',
			sub: 'This token has not been deployed on the selected network.'
		}
	};

	const copy = $derived(DEFAULT_MESSAGES[variant]);
</script>

<div class="empty" data-variant={variant}>
	<div class="empty-icon" aria-hidden="true">
		<svg width="48" height="48" viewBox="0 0 48 48" fill="none">
			<circle cx="24" cy="24" r="22" stroke="currentColor" stroke-width="1.5" opacity="0.4" />
			<path
				d="M24 14v12"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
			<circle cx="24" cy="32" r="1.6" fill="currentColor" />
		</svg>
	</div>
	<p class="empty-title">{copy.title}</p>
	<p class="empty-sub">{message ?? copy.sub}</p>
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 48px 24px;
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-xl);
		color: var(--color-text);
		text-align: center;
	}

	.empty-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
		margin-bottom: 8px;
	}

	.empty-title {
		margin: 0;
		font-family: var(--font-numeric);
		font-weight: 700;
		font-size: 16px;
		letter-spacing: -0.6px;
		color: var(--color-text);
	}

	.empty-sub {
		margin: 0;
		max-width: 360px;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 13px;
		line-height: 140%;
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
</style>
