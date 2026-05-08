<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import HistorySection from './HistorySection.svelte';
	import type { HistoryStore } from '$lib/portfolio/history.svelte';
	import type { HistoryKind, TransactionRow } from '@areal/sdk/history';

	const FAKE_SIG_BASE =
		'5HiD6dQ7nYr1QBmYZ4PTxxKgTcQ1nQjEaXkPbdghKzHb9eZeJYV8VTGoT7XTnRZSj4xkj4VV6Vb';

	function makeRow(opts: {
		id: string;
		kind: HistoryKind;
		amountA?: string | null;
		amountB?: string | null;
		minutesAgo?: number;
	}): TransactionRow {
		const blockTime = Date.now() - (opts.minutesAgo ?? 5) * 60_000;
		return {
			id: opts.id,
			kind: opts.kind,
			wallet: '11111111111111111111111111111112',
			otMint: null,
			pool: null,
			amountA: opts.amountA ?? null,
			amountB: opts.amountB ?? null,
			sharesDelta: null,
			signature: `${FAKE_SIG_BASE}${opts.id}`,
			logIndex: 0,
			blockTime
		};
	}

	const FIVE_ROWS: TransactionRow[] = [
		makeRow({ id: 'a', kind: 'claim', amountA: '12.5', minutesAgo: 3 }),
		makeRow({
			id: 'b',
			kind: 'swap',
			amountA: '100',
			amountB: '0.42',
			minutesAgo: 35
		}),
		makeRow({
			id: 'c',
			kind: 'add_lp',
			amountA: '100',
			amountB: '200',
			minutesAgo: 90
		}),
		makeRow({
			id: 'd',
			kind: 'mint_rwt',
			amountA: '100',
			amountB: '99.5',
			minutesAgo: 60 * 6
		}),
		makeRow({
			id: 'e',
			kind: 'remove_lp',
			amountA: '50',
			amountB: '100',
			minutesAgo: 60 * 24 * 2
		})
	];

	const TWENTY_ROWS: TransactionRow[] = Array.from({ length: 20 }, (_, i) =>
		makeRow({
			id: `r${i}`,
			kind:
				(['claim', 'swap', 'add_lp', 'remove_lp', 'zap_lp', 'mint_rwt'] as HistoryKind[])[i % 6],
			amountA: `${10 + i}.5`,
			amountB: i % 2 === 0 ? `${20 + i}` : null,
			minutesAgo: i * 17
		})
	);

	/**
	 * Build a synchronous in-memory `HistoryStore` stub. The component reads
	 * via getters, so we keep mutable backing variables and let the consumer
	 * tweak them between stories without retriggering Svelte reactivity (the
	 * stories are static snapshots, not interactive demos).
	 */
	function makeStubStore(opts: {
		status: 'idle' | 'loading' | 'ready' | 'error';
		items?: TransactionRow[];
		hasMore?: boolean;
		error?: string | null;
		isLoading?: boolean;
		isLoadingMore?: boolean;
		kind?: HistoryKind | null;
	}): HistoryStore {
		const items = opts.items ?? [];
		return {
			get status() {
				return opts.status;
			},
			get items() {
				return items;
			},
			get error() {
				return opts.error ?? null;
			},
			get hasMore() {
				return opts.hasMore ?? false;
			},
			get isLoading() {
				return opts.isLoading ?? (opts.status === 'loading' && items.length === 0);
			},
			get isLoadingMore() {
				return opts.isLoadingMore ?? false;
			},
			get kind() {
				return opts.kind ?? null;
			},
			start() {},
			stop() {},
			refresh() {
				return Promise.resolve();
			},
			loadMore() {
				return Promise.resolve();
			},
			setKind() {}
		};
	}

	const { Story } = defineMeta({
		title: 'Sections/HistorySection',
		component: HistorySection,
		tags: ['autodocs'],
		parameters: { layout: 'padded' }
	});
</script>

<!--
	Each story injects a stub store matching `HistoryStore`. Stories are
	rendered as if a wallet were connected — the component's "Connect wallet"
	state is exercised via the dedicated Disconnected story (which mocks the
	wallet store at module level — see the script block above).
-->

<Story name="Loaded">
	<HistorySection
		store={makeStubStore({
			status: 'ready',
			items: FIVE_ROWS
		})}
	/>
</Story>

<Story name="LoadedHasMore">
	<HistorySection
		store={makeStubStore({
			status: 'ready',
			items: TWENTY_ROWS,
			hasMore: true
		})}
	/>
</Story>

<Story name="LoadingSkeleton">
	<HistorySection
		store={makeStubStore({
			status: 'loading',
			items: [],
			isLoading: true
		})}
	/>
</Story>

<Story name="Empty">
	<HistorySection
		store={makeStubStore({
			status: 'ready',
			items: []
		})}
	/>
</Story>

<Story name="ErrorState">
	<HistorySection
		store={makeStubStore({
			status: 'error',
			items: [],
			error: '500: Internal Server Error'
		})}
	/>
</Story>

<Story name="FilterActive">
	<HistorySection
		store={makeStubStore({
			status: 'ready',
			items: FIVE_ROWS.filter((r) => r.kind === 'claim'),
			kind: 'claim'
		})}
	/>
</Story>

<Story name="LoadingMore">
	<HistorySection
		store={makeStubStore({
			status: 'ready',
			items: TWENTY_ROWS,
			hasMore: true,
			isLoadingMore: true
		})}
	/>
</Story>

<Story name="Disconnected">
	<!--
		Disconnected state is driven by the wallet store, not the history
		store. We render the real default store (which is idle when no
		wallet is set in this Storybook env) — the component's
		`isConnected` derived flips off and shows the CTA copy.
	-->
	<HistorySection />
</Story>
