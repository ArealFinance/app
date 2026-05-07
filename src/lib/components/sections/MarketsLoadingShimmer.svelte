<script lang="ts" module>
	export type MarketsLoadingShimmerVariant = 'card' | 'row';
</script>

<script lang="ts">
	type Props = {
		/**
		 * `card` — matches `TokenStatCard` shape (avatar disk + 2 text lines).
		 * `row`  — matches a list-row shape (logos + text + spacer + pill).
		 */
		variant?: MarketsLoadingShimmerVariant;
	};

	let { variant = 'card' }: Props = $props();
</script>

{#if variant === 'card'}
	<article class="shimmer-card" aria-hidden="true" aria-label="Loading">
		<div class="shimmer-head">
			<span class="shimmer-block shimmer-disk"></span>
			<div class="shimmer-name">
				<span class="shimmer-block shimmer-line shimmer-line-name"></span>
				<span class="shimmer-block shimmer-line shimmer-line-meta"></span>
			</div>
		</div>
		<div class="shimmer-price">
			<span class="shimmer-block shimmer-line shimmer-line-label"></span>
			<span class="shimmer-block shimmer-line shimmer-line-value"></span>
			<span class="shimmer-block shimmer-line shimmer-line-pill"></span>
		</div>
	</article>
{:else}
	<div class="shimmer-row" aria-hidden="true" aria-label="Loading">
		<span class="shimmer-block shimmer-row-logo"></span>
		<span class="shimmer-block shimmer-row-text"></span>
		<span class="shimmer-row-spacer"></span>
		<span class="shimmer-block shimmer-row-pill"></span>
	</div>
{/if}

<style>
	/* Shared block: tinted surface + soft animated sheen.
	 * Animation is disabled when the user prefers reduced motion. */
	.shimmer-block {
		display: block;
		background-color: var(--color-surface-inset);
		border-radius: 8px;
		position: relative;
		overflow: hidden;
	}
	.shimmer-block::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent,
			rgba(255, 255, 255, 0.04),
			transparent
		);
		transform: translateX(-100%);
		animation: shimmer-sweep 1.4s ease-in-out infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.shimmer-block::after {
			animation: none;
		}
	}

	@keyframes shimmer-sweep {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	/* ─── Card variant — mirrors TokenStatCard footprint. ─── */
	.shimmer-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 230px;
		padding: var(--space-4);
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
	}

	.shimmer-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.shimmer-disk {
		width: 44px;
		height: 44px;
		border-radius: 17px;
		flex-shrink: 0;
	}

	.shimmer-name {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 0;
	}

	.shimmer-line {
		height: 14px;
		border-radius: 6px;
	}
	.shimmer-line-name {
		width: 70%;
	}
	.shimmer-line-meta {
		width: 40%;
		height: 18px;
	}

	.shimmer-price {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: auto;
	}
	.shimmer-line-label {
		width: 30%;
		height: 10px;
	}
	.shimmer-line-value {
		width: 60%;
		height: 22px;
	}
	.shimmer-line-pill {
		width: 35%;
		height: 22px;
	}

	/* ─── Row variant — mirrors a pool/token list row footprint. ─── */
	.shimmer-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 18px;
		background-color: var(--color-surface-inset);
		border-radius: 32px;
	}
	.shimmer-row-logo {
		width: 32px;
		height: 32px;
		border-radius: 12px;
	}
	.shimmer-row-text {
		height: 16px;
		max-width: 180px;
		border-radius: 6px;
	}
	/* .shimmer-row-spacer is the implicit `1fr` grid track between the
	 * text block and the pill — it just reserves space and needs no
	 * styles of its own (an empty ruleset trips svelte-check). */
	.shimmer-row-pill {
		width: 80px;
		height: 32px;
		border-radius: 12px;
	}
</style>
