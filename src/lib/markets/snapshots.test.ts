/*
 * snapshotsStore unit tests.
 *
 * Mock surface:
 *   - `@areal/sdk/markets-rest`: stub `getPoolSnapshots` / `getPoolAggregate`.
 *   - `$lib/realtime/client.svelte`: hand-rolled stub exposing `useRoom`,
 *     `staleRooms` (reactive), and `on(channel, listener)`. Tests drive
 *     events by calling helpers on the stub.
 *   - `$lib/network/network.svelte`: reactive `mockNetworkState`.
 *
 * Architect's enumeration:
 *   1.  activate(poolA) → REST called, rows + aggregate populated.
 *   2.  late-response on activate(B) discards A's pending response.
 *   3.  period switch token-bump (24H → 7D mid-fetch).
 *   4.  live-tick merge dedupe (same blockTime → replace last).
 *   5.  live-tick gating (period=7D → ignored).
 *   6.  sliding window trim (period=24H, drop rows > 24h old).
 *   7.  stale → setInterval(60_000) → getPoolSnapshots(limit=1).
 *   8.  live → interval cleared.
 *   9.  deactivate cleanup (interval cleared, fetch-token++).
 *   10. cluster-switch reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { PublicKey } from '@solana/web3.js';
import type { SnapshotRow, DailyAggregateRow } from '@areal/sdk/markets-rest';
import type { Room } from '@areal/sdk/realtime';

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
	getPoolSnapshots: vi.fn(),
	getPoolAggregate: vi.fn()
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_MARKETS_API_URL: 'https://markets.example'
	}
}));

vi.mock('$lib/network/network.svelte', async () => {
	const helpers = await import('./test-helpers.svelte');
	return {
		network: {
			get current() {
				return helpers.mockNetworkState.current;
			}
		}
	};
});

vi.mock('@areal/sdk/markets-rest', async () => {
	const actual = await vi.importActual<typeof import('@areal/sdk/markets-rest')>(
		'@areal/sdk/markets-rest'
	);
	return {
		...actual,
		getPoolSnapshots: mocks.getPoolSnapshots,
		getPoolAggregate: mocks.getPoolAggregate
	};
});

vi.mock('@areal/sdk/network', () => ({
	BACKEND_API_BASE_URLS: {
		localnet: 'http://localhost:3010',
		devnet: 'https://markets.example',
		mainnet: 'https://markets.mainnet.example'
	}
}));

vi.mock('$lib/realtime/client.svelte', async () => {
	const helpers = await import('./snapshots-realtime-stub.svelte');
	return {
		realtimeClient: helpers.realtimeClientStub
	};
});

import { mockNetworkState, resetMockState } from './test-helpers.svelte';
import {
	realtimeClientStub,
	resetRealtimeClientStub
} from './snapshots-realtime-stub.svelte';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const POOL_A = new PublicKey('6YRfYtkZmqWgz8N3MDeqJRc4vSiJ5VGgiMv4ihYzJyY4');
const POOL_B = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
const POOL_A_BASE58 = POOL_A.toBase58();
const POOL_B_BASE58 = POOL_B.toBase58();

function makeRow(blockTime: number, overrides: Partial<SnapshotRow> = {}): SnapshotRow {
	return {
		pool: POOL_A_BASE58,
		blockTime,
		tvlA: '1000',
		tvlB: '1000',
		tvlUsd: 2000,
		reserveA: '1000',
		reserveB: '1000',
		feeGrowthA: '0',
		feeGrowthB: '0',
		lpSupply: '500',
		...overrides
	};
}

function makeAgg(day: string): DailyAggregateRow {
	return {
		pool: POOL_A_BASE58,
		day,
		volumeA24h: '0',
		volumeB24h: '0',
		feesA24h: '0',
		feesB24h: '0',
		txCount24h: 0,
		uniqueWallets24h: 0,
		apy24h: null,
		updatedAt: '2026-05-09T00:00:00Z'
	};
}

async function settle(times = 4) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('snapshotsStore', () => {
	let snapshotsStore: typeof import('./snapshots.svelte').snapshotsStore;
	let __resetSnapshotsForTests: typeof import('./snapshots.svelte').__resetSnapshotsForTests;

	beforeEach(async () => {
		resetMockState();
		resetRealtimeClientStub();
		mocks.getPoolSnapshots.mockReset();
		mocks.getPoolAggregate.mockReset();
		const mod = await import('./snapshots.svelte');
		snapshotsStore = mod.snapshotsStore;
		__resetSnapshotsForTests = mod.__resetSnapshotsForTests;
		__resetSnapshotsForTests();
	});

	afterEach(() => {
		__resetSnapshotsForTests();
		vi.useRealTimers();
	});

	it('activate(pool) → REST called; rows + aggregate populated (period=24H)', async () => {
		const now = Math.floor(Date.now() / 1000);
		const row1 = makeRow(now - 1000);
		const row2 = makeRow(now - 500);
		mocks.getPoolSnapshots.mockResolvedValue({ items: [row2, row1] }); // latest-first
		mocks.getPoolAggregate.mockResolvedValue({ items: [makeAgg('2026-05-09')] });

		// Default period is '7D' — switch to '24H' for the snapshot path.
		snapshotsStore.setPeriod('24H');
		flushSync();
		await settle();
		mocks.getPoolSnapshots.mockClear();
		mocks.getPoolAggregate.mockClear();

		snapshotsStore.activate(POOL_A);
		flushSync();
		await settle();

		expect(mocks.getPoolSnapshots).toHaveBeenCalledTimes(1);
		const args = mocks.getPoolSnapshots.mock.calls[0][0];
		expect(args.pool).toBe(POOL_A_BASE58);
		expect(args.limit).toBe(200);
		expect(args.baseUrl).toBe('https://markets.example');

		// rows are sorted ASC by blockTime.
		expect(snapshotsStore.rows.map((r) => r.blockTime)).toEqual([row1.blockTime, row2.blockTime]);
		expect(snapshotsStore.aggregate).toHaveLength(1);
		expect(snapshotsStore.status).toBe('ready');
	});

	it('late-response on activate switch (A → B; A discarded)', async () => {
		mocks.getPoolAggregate.mockReset();

		// First call (A) hangs.
		let resolveA: (v: { items: SnapshotRow[] }) => void;
		const promiseA = new Promise<{ items: SnapshotRow[] }>((r) => {
			resolveA = r;
		});
		mocks.getPoolSnapshots.mockImplementationOnce(() => promiseA);
		mocks.getPoolAggregate.mockImplementationOnce(
			() => new Promise(() => {}) // hang
		);

		snapshotsStore.setPeriod('24H');
		flushSync();

		snapshotsStore.activate(POOL_A);
		flushSync();
		await settle();

		// Switch to pool B before A resolves. Use a fresh blockTime so the
		// sliding-window trim keeps the row.
		const nowSec = Math.floor(Date.now() / 1000);
		const rowsB = [makeRow(nowSec - 100, { pool: POOL_B_BASE58 })];
		mocks.getPoolSnapshots.mockResolvedValueOnce({ items: rowsB });
		mocks.getPoolAggregate.mockResolvedValueOnce({ items: [] });
		snapshotsStore.activate(POOL_B);
		flushSync();
		await settle();

		// Now resolve A — must be discarded.
		resolveA!({ items: [makeRow(nowSec - 50, { pool: POOL_A_BASE58 })] });
		await settle();
		flushSync();

		expect(snapshotsStore.rows.map((r) => r.pool)).toEqual([POOL_B_BASE58]);
	});

	it('period switch (24H → 7D) bumps fetch-token, drops mid-flight 24H result', async () => {
		// 24H call hangs.
		let resolveSnaps: (v: { items: SnapshotRow[] }) => void;
		const snapsPromise = new Promise<{ items: SnapshotRow[] }>((r) => {
			resolveSnaps = r;
		});
		mocks.getPoolSnapshots.mockImplementationOnce(() => snapsPromise);
		mocks.getPoolAggregate.mockImplementationOnce(() => new Promise(() => {}));

		snapshotsStore.setPeriod('24H');
		snapshotsStore.activate(POOL_A);
		flushSync();
		await settle();

		// Switch to 7D — kicks off a getPoolAggregate(days=7) call.
		const aggRows = [makeAgg('2026-05-09'), makeAgg('2026-05-08')];
		mocks.getPoolAggregate.mockResolvedValueOnce({ items: aggRows });
		snapshotsStore.setPeriod('7D');
		flushSync();
		await settle();
		flushSync();

		// Resolve the 24H snapshots — must be dropped.
		resolveSnaps!({ items: [makeRow(123_456)] });
		await settle();
		flushSync();

		expect(snapshotsStore.aggregate).toEqual(aggRows);
		expect(snapshotsStore.rows).toEqual([]); // aggregate path clears rows
		expect(snapshotsStore.status).toBe('ready');
	});

	it('live-tick merge dedupe (same blockTime → replace last)', async () => {
		const now = Math.floor(Date.now() / 1000);
		const initial = makeRow(now - 60, { reserveA: '111' });
		mocks.getPoolSnapshots.mockResolvedValue({ items: [initial] });
		mocks.getPoolAggregate.mockResolvedValue({ items: [] });

		snapshotsStore.setPeriod('24H');
		snapshotsStore.activate(POOL_A);
		flushSync();
		await settle();

		// Same blockTime → replace.
		realtimeClientStub.__emit('pool_snapshot', {
			...makeRow(now - 60, { reserveA: '999' })
		});
		await settle();
		flushSync();

		expect(snapshotsStore.rows).toHaveLength(1);
		expect(snapshotsStore.rows[0]!.reserveA).toBe('999');

		// Newer blockTime → append.
		realtimeClientStub.__emit('pool_snapshot', makeRow(now - 30, { reserveA: '777' }));
		await settle();
		flushSync();

		expect(snapshotsStore.rows.map((r) => r.reserveA)).toEqual(['999', '777']);
	});

	it('live-tick gating (period !== 24H → ignored)', async () => {
		mocks.getPoolAggregate.mockResolvedValue({ items: [makeAgg('2026-05-09')] });

		// Default period 7D → aggregate path.
		snapshotsStore.activate(POOL_A);
		flushSync();
		await settle();

		realtimeClientStub.__emit('pool_snapshot', makeRow(123_456));
		await settle();

		expect(snapshotsStore.rows).toEqual([]);
	});

	it('sliding window trim drops rows > 24h old on each new tick', async () => {
		const now = Math.floor(Date.now() / 1000);
		const fresh = makeRow(now - 1000);
		const old = makeRow(now - 90_000); // > 24h
		// Initial fetch returns fresh + old together; trim should drop `old`.
		mocks.getPoolSnapshots.mockResolvedValue({ items: [fresh, old] });
		mocks.getPoolAggregate.mockResolvedValue({ items: [] });

		snapshotsStore.setPeriod('24H');
		snapshotsStore.activate(POOL_A);
		flushSync();
		await settle();

		expect(snapshotsStore.rows.map((r) => r.blockTime)).toEqual([fresh.blockTime]);

		// Append a new tick well within the window.
		realtimeClientStub.__emit('pool_snapshot', makeRow(now - 500));
		await settle();
		flushSync();

		expect(snapshotsStore.rows.every((r) => r.blockTime > now - 86_400)).toBe(true);
	});

	it('stale → setInterval poll → live → interval cleared', async () => {
		vi.useFakeTimers();
		const now = Math.floor(Date.now() / 1000);
		mocks.getPoolSnapshots.mockResolvedValue({ items: [makeRow(now - 100)] });
		mocks.getPoolAggregate.mockResolvedValue({ items: [] });

		snapshotsStore.setPeriod('24H');
		snapshotsStore.activate(POOL_A);
		flushSync();
		await vi.advanceTimersByTimeAsync(0);
		await settle();
		flushSync();

		mocks.getPoolSnapshots.mockClear();

		// Mark room stale → store should start polling every 60s.
		realtimeClientStub.__setStale(`pool:${POOL_A_BASE58}`, true);
		flushSync();

		// 60s tick — one poll.
		mocks.getPoolSnapshots.mockResolvedValue({ items: [makeRow(now - 5)] });
		await vi.advanceTimersByTimeAsync(60_000);
		await settle();
		expect(mocks.getPoolSnapshots).toHaveBeenCalledTimes(1);
		expect(mocks.getPoolSnapshots.mock.calls[0][0].limit).toBe(1);

		// Live → clears the timer.
		realtimeClientStub.__setStale(`pool:${POOL_A_BASE58}`, false);
		flushSync();

		mocks.getPoolSnapshots.mockClear();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(mocks.getPoolSnapshots).not.toHaveBeenCalled();
	});

	it('deactivate clears poll timer and bumps fetch-token', async () => {
		vi.useFakeTimers();
		const now = Math.floor(Date.now() / 1000);
		mocks.getPoolSnapshots.mockResolvedValue({ items: [makeRow(now - 100)] });
		mocks.getPoolAggregate.mockResolvedValue({ items: [] });

		snapshotsStore.setPeriod('24H');
		snapshotsStore.activate(POOL_A);
		flushSync();
		await vi.advanceTimersByTimeAsync(0);
		await settle();
		flushSync();

		realtimeClientStub.__setStale(`pool:${POOL_A_BASE58}`, true);
		flushSync();
		mocks.getPoolSnapshots.mockClear();

		snapshotsStore.deactivate();
		flushSync();

		await vi.advanceTimersByTimeAsync(120_000);
		expect(mocks.getPoolSnapshots).not.toHaveBeenCalled();
		expect(snapshotsStore.status).toBe('idle');
	});

	it('cluster-switch invalidates in-flight fetch and re-dispatches', async () => {
		// First fetch hangs.
		let resolveFirst: (v: { items: SnapshotRow[] }) => void;
		const firstPromise = new Promise<{ items: SnapshotRow[] }>((r) => {
			resolveFirst = r;
		});
		mocks.getPoolSnapshots.mockImplementationOnce(() => firstPromise);
		mocks.getPoolAggregate.mockImplementationOnce(() => new Promise(() => {}));

		snapshotsStore.setPeriod('24H');
		snapshotsStore.activate(POOL_A);
		flushSync();
		await settle();

		// Switch network → bumps token, kicks fresh fetch.
		const nowSec = Math.floor(Date.now() / 1000);
		const mainnetRows = [makeRow(nowSec - 100, { reserveA: 'mainnet' })];
		mocks.getPoolSnapshots.mockResolvedValueOnce({ items: mainnetRows });
		mocks.getPoolAggregate.mockResolvedValueOnce({ items: [] });
		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();
		flushSync();

		// Resolve the original fetch — must be dropped.
		resolveFirst!({ items: [makeRow(nowSec - 50, { reserveA: 'devnet' })] });
		await settle();
		flushSync();

		expect(snapshotsStore.rows.map((r) => r.reserveA)).toEqual(['mainnet']);
	});
});
