<script lang="ts">
	import { Modal } from '$lib/components/ui';
	import { Xmark, Clipboard, ArrowUpRightSmall, ArrowRightSmall, Plus } from '$lib/icons';
	import { wallet, type Transaction } from '$lib/stores/wallet.svelte';
	import { walletDialog } from '$lib/stores/walletDialog.svelte';
	import TransactionRow from './TransactionRow.svelte';

	const open = $derived(walletDialog.mode === 'panel' && wallet.isConnected);

	let confirmOpen = $state(false);
	let copied = $state(false);

	// Group transactions by their date string for the date-chip headers.
	const grouped = $derived.by(() => {
		const groups: Array<{ date: string; items: Transaction[] }> = [];
		for (const tx of wallet.transactions) {
			const last = groups[groups.length - 1];
			if (last && last.date === tx.date) last.items.push(tx);
			else groups.push({ date: tx.date, items: [tx] });
		}
		return groups;
	});

	async function handleCopy() {
		const ok = await wallet.copyAddress();
		if (ok) {
			copied = true;
			setTimeout(() => (copied = false), 1500);
		}
	}

	function handleClose() {
		confirmOpen = false;
		walletDialog.close();
	}

	function confirmDisconnect() {
		wallet.disconnect();
		confirmOpen = false;
		walletDialog.close();
	}

	const explorerHref = $derived(
		wallet.address ? `https://solscan.io/account/${wallet.address}` : '#'
	);

	// ESC also dismisses the inline confirm popover before closing the modal.
	$effect(() => {
		if (!confirmOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				confirmOpen = false;
			}
		};
		document.addEventListener('keydown', onKey, true);
		return () => document.removeEventListener('keydown', onKey, true);
	});
</script>

<Modal {open} onclose={handleClose} aria-labelledby="wallet-panel-title">
	<div class="wallet-panel">
		<div class="wallet-panel-aurora" aria-hidden="true"></div>

		<header class="wallet-panel-bar">
			<div class="wallet-panel-chip" title={wallet.address ?? ''}>
				<span class="wallet-panel-dot" aria-hidden="true"></span>
				<span class="wallet-panel-addr">{wallet.displayAddress}</span>
				<button
					type="button"
					class="wallet-panel-icon-btn"
					aria-label={copied ? 'Address copied' : 'Copy address'}
					onclick={handleCopy}
				>
					<Clipboard size={14} />
				</button>
				<a
					class="wallet-panel-icon-btn"
					href={explorerHref}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Open in explorer"
				>
					<ArrowUpRightSmall size={14} />
				</a>
			</div>

			<div class="wallet-panel-logout-anchor">
				<button
					type="button"
					class="wallet-panel-logout"
					aria-label="Disconnect wallet"
					onclick={() => (confirmOpen = !confirmOpen)}
				>
					<ArrowRightSmall size={16} />
				</button>

				{#if confirmOpen}
					<div class="wallet-panel-confirm" role="dialog" aria-label="Disconnect confirmation">
						<span class="wallet-panel-confirm-icon" aria-hidden="true">
							<Plus size={20} variant="filled" />
						</span>
						<p class="wallet-panel-confirm-text">Disable the wallet?</p>
						<div class="wallet-panel-confirm-actions">
							<button
								type="button"
								class="wallet-panel-confirm-btn wallet-panel-confirm-no"
								onclick={() => (confirmOpen = false)}
							>
								No
							</button>
							<button
								type="button"
								class="wallet-panel-confirm-btn wallet-panel-confirm-yes"
								onclick={confirmDisconnect}
							>
								Yes
							</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="wallet-panel-status">
				<span class="wallet-panel-status-dot" aria-hidden="true"></span>
				<span class="wallet-panel-status-label">Connected</span>
			</div>

			<button
				type="button"
				class="wallet-panel-close"
				aria-label="Close"
				onclick={handleClose}
			>
				<Xmark size={20} />
			</button>
		</header>

		<h2 id="wallet-panel-title" class="wallet-panel-title">Transactions</h2>

		<div class="wallet-panel-list">
			{#each grouped as group (group.date)}
				<span class="wallet-panel-date">{group.date}</span>
				<div class="wallet-panel-rows">
					{#each group.items as tx, i (tx.id + i)}
						<TransactionRow {tx} />
					{/each}
				</div>
			{/each}
		</div>

		{#if wallet.hasMore}
			<button type="button" class="wallet-panel-loadmore" onclick={() => wallet.loadMore()}>
				Load more
			</button>
		{/if}
	</div>
</Modal>

<style>
	.wallet-panel {
		position: relative;
		width: 444px;
		max-width: 100%;
		/* Fixed Figma height (589). Falls back to the viewport when the screen
		 * is shorter than that. The internal list scrolls — the modal itself
		 * doesn't grow when 'Load more' adds rows. */
		height: 589px;
		max-height: calc(100dvh - 2 * var(--space-4));
		padding: 18px;
		background-color: var(--color-surface); /* #080A0F */
		border-radius: var(--radius-xl);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	/* Figma-exported blur composite — bright purple bloom baked into the top
	 * of the PNG, fading to transparent toward the bottom. Plain opacity
	 * (no mix-blend-mode) on purpose: blend modes on a panel descendant
	 * isolate the panel's stacking context, which breaks backdrop-filter
	 * on the disconnect popover later. */
	.wallet-panel-aurora {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: url('/images/wallet/panel-blur.png');
		background-size: cover;
		background-position: top center;
		background-repeat: no-repeat;
		opacity: 0.55;
	}

	.wallet-panel > :not(.wallet-panel-aurora) {
		position: relative;
		z-index: 1;
	}

	/* Top toolbar: address chip + logout btn + connected pill + close X. */
	.wallet-panel-bar {
		display: grid;
		grid-template-columns: auto auto 1fr auto;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		flex-shrink: 0;
	}

	.wallet-panel-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: 32px;
		padding: 0 10px;
		background-color: rgba(0, 0, 0, 0.3);
		border-radius: var(--radius-md);
	}

	.wallet-panel-dot {
		width: 16px;
		height: 16px;
		border-radius: var(--radius-full);
		background: linear-gradient(180deg, #a56eff 0%, #602fdc 100%);
		flex-shrink: 0;
	}

	.wallet-panel-addr {
		font-family: var(--font-body);
		font-size: var(--text-xs); /* 11 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: 1px;
		text-transform: uppercase;
		color: var(--color-purple-200); /* #EADAFF */
	}

	.wallet-panel-icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		background: transparent;
		border: 0;
		padding: 0;
		color: var(--color-purple-200);
		cursor: pointer;
		text-decoration: none;
		opacity: 0.85;
		transition: opacity var(--motion-base) var(--ease-out);
	}
	.wallet-panel-icon-btn:hover {
		opacity: 1;
	}

	.wallet-panel-logout-anchor {
		position: relative;
	}

	.wallet-panel-logout {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background-color: rgba(0, 0, 0, 0.3);
		border: 0;
		border-radius: var(--radius-md);
		color: var(--color-purple-200);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.wallet-panel-logout:hover {
		background-color: rgba(0, 0, 0, 0.5);
	}

	/* Inline confirm popover anchored under the logout button.
	 *
	 * Figma calls for `rgba(0,0,0,0.6) + backdrop-filter: blur(6px)`. backdrop-
	 * filter doesn't fire reliably here — the popover sits 4 layers deep
	 * (modal-frame → wallet-panel with overflow:hidden+border-radius → bar →
	 * logout-anchor) and the modal-backdrop already paints its own blur on
	 * top of the page. Each ancestor introduces a compositing barrier that
	 * tries to break the filter chain.
	 *
	 * Pragmatic fallback: opaque dark surface (surface-inset, slightly lighter
	 * than the panel) with a 1px white-8% border + drop shadow. Reads as a
	 * raised tile, hides the rows behind it cleanly, and works in every
	 * browser regardless of context isolation. */
	.wallet-panel-confirm {
		position: absolute;
		top: calc(100% + var(--space-2));
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		width: 172px;
		padding: var(--space-3) var(--space-3) var(--space-2);
		background-color: var(--color-surface-inset); /* #181A29 */
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		box-shadow: var(--shadow-overlay);
	}

	.wallet-panel-confirm-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		color: var(--color-text);
		transform: rotate(45deg);
		opacity: 0.9;
	}

	.wallet-panel-confirm-text {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
		text-align: center;
	}

	.wallet-panel-confirm-actions {
		display: flex;
		gap: 4px;
	}

	.wallet-panel-confirm-btn {
		width: 76px;
		height: 33px;
		border: 0;
		border-radius: var(--radius-md);
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		cursor: pointer;
	}
	.wallet-panel-confirm-no {
		background-color: var(--color-white-900);
		color: var(--color-text-inverse);
	}
	.wallet-panel-confirm-yes {
		background-color: var(--color-surface-inset);
		color: var(--color-text);
	}

	.wallet-panel-status {
		display: inline-flex;
		justify-self: end;
		align-items: center;
		gap: var(--space-2);
		height: 32px;
		padding: 0 var(--space-3);
		background-color: rgba(115, 255, 131, 0.15);
		border-radius: var(--radius-md);
	}

	.wallet-panel-status-dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background-color: var(--color-green-900);
		box-shadow: 0 0 8px 4px rgba(115, 255, 131, 0.5);
	}

	.wallet-panel-status-label {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-green-900);
	}

	.wallet-panel-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 0;
		color: var(--color-text);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.wallet-panel-close:hover {
		background-color: rgba(255, 255, 255, 0.08);
	}

	.wallet-panel-title {
		margin: var(--space-4) 0 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg); /* 18 */
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		flex-shrink: 0;
	}

	/* Date chip + tx rows. The date chip is intentionally rounded only on the
	 * top corners so it visually fuses with the row stack underneath. */
	.wallet-panel-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.wallet-panel-date {
		align-self: flex-start;
		margin-top: var(--space-2);
		padding: 6px var(--space-2);
		background-color: rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-md) var(--radius-md) 0 0;
		font-family: var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.wallet-panel-rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.wallet-panel-loadmore {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 48px;
		background-color: var(--color-surface);
		border: 1px solid #333548;
		border-radius: var(--radius-lg);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		cursor: pointer;
		flex-shrink: 0;
		transition: background-color var(--motion-base) var(--ease-out);
	}
	.wallet-panel-loadmore:hover {
		background-color: rgba(255, 255, 255, 0.04);
	}

	@media (max-width: 480px) {
		.wallet-panel {
			width: 100%;
			min-height: auto;
		}
		.wallet-panel-bar {
			grid-template-columns: 1fr auto auto;
			grid-template-rows: auto auto;
			gap: var(--space-2);
		}
		.wallet-panel-chip {
			grid-column: 1 / -1;
		}
		.wallet-panel-status {
			justify-self: start;
		}
	}
</style>
