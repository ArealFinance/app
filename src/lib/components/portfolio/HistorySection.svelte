<script lang="ts" module>
	import type { HistoryStore } from '$lib/portfolio/history.svelte';

	export type HistorySectionProps = {
		/**
		 * Optional store override. Production renders use the singleton; tests
		 * and Storybook stories inject a stub matching the `HistoryStore`
		 * shape so each story can show a different state.
		 */
		store?: HistoryStore;
	};
</script>

<script lang="ts">
	/*
	 * Recent activity card on the /portfolio page.
	 *
	 * Reads from `historyStore` (or an injected stub for stories) and renders:
	 *   - Header  : "Recent activity" + count badge (when ready, items > 0)
	 *   - Filters : All / Claim / Swap / Add LP / Remove LP / Zap LP / Mint RWT
	 *   - Body    : disconnected | loading | error | empty | rows
	 *   - Footer  : "Load more" — visible while hasMore, disabled while in-flight
	 *
	 * The store handles wallet/network/filter changes on its own. The component
	 * is just a presentation surface; only the kind tab buttons mutate store
	 * state (via setKind) and the retry / load-more buttons trigger refresh /
	 * loadMore.
	 *
	 * Mobile (≤ 768px) collapses the table layout into a stacked card per row.
	 */
	import { Card } from '$lib/components/ui';
	import { Check, Clock, Repeat, ArrowUpDownSimple, Plus, Minus, FileText } from '$lib/icons';
	import { wallet } from '$lib/stores/wallet.svelte';
	import { network } from '$lib/network/network.svelte';
	import { historyStore as defaultStore } from '$lib/portfolio/history.svelte';
	import {
		kindLabel,
		relativeTime,
		rowDescription,
		solscanLink
	} from '$lib/portfolio/history-format';
	import type { HistoryKind, TransactionRow } from '@areal/sdk/history';

	let { store = defaultStore }: HistorySectionProps = $props();

	// Filter tabs — `null` = All. Order matches the spec: claim, swap, add_lp,
	// remove_lp, zap_lp, mint_rwt.
	const FILTERS: ReadonlyArray<{ key: HistoryKind | null; label: string }> = [
		{ key: null, label: 'All' },
		{ key: 'claim', label: 'Claim' },
		{ key: 'swap', label: 'Swap' },
		{ key: 'add_lp', label: 'Add LP' },
		{ key: 'remove_lp', label: 'Remove LP' },
		{ key: 'zap_lp', label: 'Zap LP' },
		{ key: 'mint_rwt', label: 'Mint RWT' }
	];

	// Truncate signature like a wallet address. Mirrors the helper in
	// ClaimConfirmModal — keeping a local copy avoids cross-component imports
	// for a 3-line function.
	function truncSig(sig: string): string {
		if (sig.length <= 12) return sig;
		return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
	}

	function iconFor(kind: HistoryKind) {
		switch (kind) {
			case 'claim':
				return Check;
			case 'swap':
				return ArrowUpDownSimple;
			case 'add_lp':
				return Plus;
			case 'remove_lp':
				return Minus;
			case 'zap_lp':
				return Repeat;
			case 'mint_rwt':
				return FileText;
		}
	}

	const isConnected = $derived(wallet.isConnected);

	function handleSelectKind(kind: HistoryKind | null) {
		store.setKind(kind);
	}
	function handleRetry() {
		void store.refresh();
	}
	function handleLoadMore() {
		void store.loadMore();
	}

	// `now` is captured once per render so all relativeTime calls inside one
	// render use the same anchor — avoids a frame where row #1 says "5m ago"
	// and row #2 (rendered 2ms later) says "5m 1s ago". Re-renders refresh
	// it naturally.
	const now = $derived(Date.now());

	function renderRow(row: TransactionRow) {
		return {
			signature: row.signature,
			label: kindLabel(row.kind),
			description: rowDescription(row),
			when: relativeTime(row.blockTime, now),
			Icon: iconFor(row.kind),
			link: solscanLink(row.signature, network.current)
		};
	}
</script>

<Card variant="inset" radius="xl" padding="none">
	<section class="history">
		<header class="history-head">
			<div class="history-head-left">
				<h2>Recent activity</h2>
				{#if store.status === 'ready' && store.items.length > 0}
					<span class="count-badge">({store.items.length})</span>
				{/if}
			</div>
		</header>

		<!-- Filter tabs -->
		<nav class="filters" aria-label="Transaction kind filter">
			{#each FILTERS as f (f.key ?? '__all__')}
				<button
					type="button"
					class="filter-btn"
					class:filter-btn-active={store.kind === f.key}
					onclick={() => handleSelectKind(f.key)}
				>
					{f.label}
				</button>
			{/each}
		</nav>

		<div class="body">
			{#if !isConnected}
				<div class="state state-cta">
					<Clock size={28} />
					<p class="state-title">Connect wallet to see history</p>
				</div>
			{:else if store.status === 'loading' && store.items.length === 0}
				<!-- 3 skeleton rows while the first page loads. -->
				<div class="rows">
					{#each [0, 1, 2] as i (i)}
						<div class="row row-skeleton" aria-hidden="true">
							<span class="row-icon skeleton-block"></span>
							<span class="row-text">
								<span class="row-line skeleton-block"></span>
								<span class="row-line row-line-short skeleton-block"></span>
							</span>
							<span class="row-meta skeleton-block"></span>
						</div>
					{/each}
				</div>
			{:else if store.status === 'error'}
				<div class="state state-error">
					<p class="state-title">Could not load history</p>
					{#if store.error}
						<p class="state-sub">{store.error}</p>
					{/if}
					<button type="button" class="retry-btn" onclick={handleRetry}>Retry</button>
				</div>
			{:else if store.items.length === 0}
				<div class="state state-empty">
					<p class="state-title">No transactions yet</p>
					<p class="state-sub">
						Claim, swap, or add liquidity to see history here.
					</p>
				</div>
			{:else}
				<div class="rows">
					{#each store.items as row (row.signature + ':' + row.logIndex)}
						{@const view = renderRow(row)}
						<div class="row">
							<span class="row-icon" aria-hidden="true">
								<view.Icon size={16} />
							</span>
							<div class="row-text">
								<div class="row-line">
									<span class="row-kind">{view.label}</span>
									<span class="row-desc">{view.description}</span>
								</div>
								<div class="row-line row-line-meta">
									<span class="row-time">{view.when}</span>
									{#if view.link}
										<a
											class="row-sig"
											href={view.link}
											target="_blank"
											rel="noopener noreferrer"
										>
											{truncSig(view.signature)}
										</a>
									{:else}
										<span class="row-sig row-sig-flat">{truncSig(view.signature)}</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				{#if store.hasMore}
					<div class="footer">
						<button
							type="button"
							class="load-more-btn"
							disabled={store.isLoadingMore}
							onclick={handleLoadMore}
						>
							{store.isLoadingMore ? 'Loading…' : 'Load more'}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</section>
</Card>

<style>
	.history {
		margin: 4px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.history-head {
		padding: 20px 20px 12px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.history-head-left {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.history-head h2 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg);
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}
	.count-badge {
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
	}

	/* ------------ Filter tabs ------------ */
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: 0 20px 12px;
	}
	.filter-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 28px;
		padding: 0 12px;
		background-color: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background-color var(--motion-base) var(--ease-out),
			border-color var(--motion-base) var(--ease-out),
			color var(--motion-base) var(--ease-out);
	}
	.filter-btn:hover {
		background-color: rgba(255, 255, 255, 0.04);
		color: var(--color-text);
	}
	.filter-btn-active {
		background-color: var(--color-surface-inset);
		border-color: var(--color-purple-500);
		color: var(--color-text);
	}

	/* ------------ Body wrapper ------------ */
	.body {
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		min-height: 220px;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	/* ------------ State panes ------------ */
	.state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-3);
		text-align: center;
		color: var(--color-text-muted);
	}
	.state-title {
		margin: 0;
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.state-sub {
		margin: 0;
		max-width: 320px;
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
	}
	.retry-btn {
		margin-top: var(--space-3);
		padding: 8px 18px;
		background-color: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.retry-btn:hover {
		background-color: rgba(255, 255, 255, 0.04);
	}

	/* ------------ Rows ------------ */
	.rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-md);
		padding: 4px;
	}
	.row {
		display: grid;
		grid-template-columns: 32px 1fr auto;
		align-items: center;
		gap: var(--space-3);
		padding: 12px 14px;
		background-color: var(--color-surface);
		border-radius: var(--radius-sm);
	}
	.row-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: var(--color-surface-inset);
		border-radius: 9px;
		color: var(--color-text);
	}
	.row-text {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row-line {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		font-family: var(--font-body);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.row-line-meta {
		gap: var(--space-3);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}
	.row-line-short {
		max-width: 60%;
	}
	.row-kind {
		flex-shrink: 0;
		padding: 2px 8px;
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-xs);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		color: var(--color-text);
	}
	.row-desc {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-time {
		flex-shrink: 0;
	}
	.row-sig {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		text-decoration: none;
	}
	.row-sig:hover {
		color: var(--color-text);
		text-decoration: underline;
	}
	.row-sig-flat {
		cursor: default;
	}
	.row-sig-flat:hover {
		text-decoration: none;
		color: var(--color-text-muted);
	}
	.row-meta {
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	/* ------------ Skeleton ------------ */
	.row-skeleton .row-line {
		height: 12px;
		width: 60%;
		background-color: var(--color-surface-inset);
		border-radius: var(--radius-xs);
	}
	.skeleton-block {
		background-color: var(--color-surface-inset);
		animation: skeleton-pulse 1.4s ease-in-out infinite;
	}
	.row-skeleton .row-icon {
		width: 32px;
		height: 32px;
		border-radius: 9px;
	}
	.row-skeleton .row-meta {
		width: 60px;
		height: 12px;
		border-radius: var(--radius-xs);
	}
	@keyframes skeleton-pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 0.7;
		}
	}

	/* ------------ Footer ------------ */
	.footer {
		display: flex;
		justify-content: center;
		padding-top: var(--space-2);
	}
	.load-more-btn {
		min-width: 140px;
		height: 36px;
		padding: 0 var(--space-4);
		background-color: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.load-more-btn:hover:not(:disabled) {
		background-color: rgba(255, 255, 255, 0.04);
	}
	.load-more-btn:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	/* ------------ Mobile ------------ */
	@media (max-width: 768px) {
		.history-head {
			padding: var(--space-4) var(--space-4) var(--space-2);
		}
		.filters {
			padding: 0 var(--space-4) var(--space-2);
		}
		.body {
			padding: var(--space-3);
		}
		.row {
			grid-template-columns: 32px 1fr;
			grid-template-rows: auto auto;
			row-gap: 6px;
		}
		.row-meta {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-content: space-between;
		}
		.row-text {
			grid-column: 2;
			grid-row: 1;
		}
		.row-line-meta {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.row-line .row-desc {
			white-space: normal;
		}
	}
</style>
