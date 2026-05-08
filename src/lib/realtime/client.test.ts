/*
 * Realtime client unit tests.
 *
 * Strategy mirrors `portfolio/history.test.ts`: mock `network.svelte` with
 * a reactive helper so cluster switches drive the cluster-watch effect.
 * The underlying socket is faked via the SDK's `ioFactory` injection point
 * so we can drive lifecycle events deterministically.
 *
 * Cases (architect's enumeration):
 *   1. Ref-count basic: 2× useRoom same room → 1 subscribe; first off → no
 *      unsubscribe; 2nd off after grace → unsubscribe.
 *   2. Grace cancellation: off → useRoom within 5s → grace cancelled.
 *   3. Cluster-switch re-subscribe: setNetwork → disconnect + new connect +
 *      subscribe in insertion order.
 *   4. Late-ack guard: cluster-switch mid-subscribe; old ack ignored.
 *   5. Stale event → staleRooms set; live event → removed.
 *   6. Disconnect after refCount=0 + grace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

import type { IoFactory } from '@areal/sdk/realtime';

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_REALTIME_WS_URL: 'wss://realtime.example/realtime'
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

import { mockNetworkState, resetMockState } from './test-helpers.svelte';

const VALID_POOL_A = '6YRfYtkZmqWgz8N3MDeqJRc4vSiJ5VGgiMv4ihYzJyY4';
const VALID_POOL_B = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

class FakeSocket {
	connected = false;
	private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
	emitLog: Array<{ channel: string; payload: unknown; ack?: (a: unknown) => void }> = [];
	disconnected = false;
	url = '';
	ioOptions: Record<string, unknown> = {};

	on(channel: string, listener: (...args: unknown[]) => void): unknown {
		let set = this.handlers.get(channel);
		if (!set) {
			set = new Set();
			this.handlers.set(channel, set);
		}
		set.add(listener);
		return this;
	}

	off(channel: string, listener?: (...args: unknown[]) => void): unknown {
		const set = this.handlers.get(channel);
		if (!set) return this;
		if (listener) set.delete(listener);
		else set.clear();
		return this;
	}

	emit(channel: string, ...args: unknown[]): unknown {
		const last = args[args.length - 1];
		if (typeof last === 'function') {
			const payload = args.length > 1 ? args[0] : undefined;
			this.emitLog.push({
				channel,
				payload,
				ack: last as (a: unknown) => void
			});
		} else {
			this.emitLog.push({ channel, payload: args[0] });
		}
		return this;
	}

	disconnect(): unknown {
		this.disconnected = true;
		this.connected = false;
		this.fire('disconnect');
		return this;
	}

	fire(channel: string, ...args: unknown[]): void {
		const set = this.handlers.get(channel);
		if (!set) return;
		for (const fn of Array.from(set)) {
			fn(...args);
		}
	}

	subscribeEmits(): Array<{ payload: unknown; ack?: (a: unknown) => void }> {
		return this.emitLog.filter((e) => e.channel === 'subscribe');
	}

	unsubscribeEmits(): Array<{ payload: unknown; ack?: (a: unknown) => void }> {
		return this.emitLog.filter((e) => e.channel === 'unsubscribe');
	}

	ackAllPending(): void {
		for (const e of this.emitLog) {
			if (e.ack) {
				const ack = e.ack;
				e.ack = undefined;
				ack({ ok: true });
			}
		}
	}
}

function makeFactory(): { factory: IoFactory; sockets: FakeSocket[] } {
	const sockets: FakeSocket[] = [];
	const factory: IoFactory = (url, opts) => {
		const s = new FakeSocket();
		s.url = url;
		s.ioOptions = opts;
		sockets.push(s);
		return s as unknown as ReturnType<IoFactory>;
	};
	return { factory, sockets };
}

async function settle(times = 4) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

describe('realtimeClient', () => {
	let realtimeClient: typeof import('./client.svelte').realtimeClient;
	let __setIoFactoryForTests: typeof import('./client.svelte').__setIoFactoryForTests;
	let __resetRealtimeForTests: typeof import('./client.svelte').__resetRealtimeForTests;

	beforeEach(async () => {
		resetMockState();
		vi.useFakeTimers();
		const mod = await import('./client.svelte');
		realtimeClient = mod.realtimeClient;
		__setIoFactoryForTests = mod.__setIoFactoryForTests;
		__resetRealtimeForTests = mod.__resetRealtimeForTests;
		__resetRealtimeForTests();
	});

	afterEach(() => {
		__resetRealtimeForTests();
		__setIoFactoryForTests(null);
		vi.useRealTimers();
	});

	it('ref-count: 2 useRoom same room → 1 subscribe; off + grace → unsubscribe', async () => {
		const { factory, sockets } = makeFactory();
		__setIoFactoryForTests(factory);

		const h1 = realtimeClient.useRoom('protocol');
		flushSync();
		await settle();

		expect(sockets.length).toBe(1);
		const sock = sockets[0]!;
		expect(sock.subscribeEmits()).toHaveLength(1);
		expect(sock.subscribeEmits()[0]!.payload).toEqual({ room: 'protocol' });

		// Second useRoom on the same room → no second subscribe.
		const h2 = realtimeClient.useRoom('protocol');
		flushSync();
		await settle();
		expect(sock.subscribeEmits()).toHaveLength(1);

		// First off → no unsubscribe yet (refCount goes from 2 → 1).
		h1.off();
		await settle();
		expect(sock.unsubscribeEmits()).toHaveLength(0);

		// Second off → 1 → 0 transition; schedules unsubscribe after 5s grace.
		h2.off();
		await settle();
		// Pre-grace: still no unsubscribe.
		expect(sock.unsubscribeEmits()).toHaveLength(0);

		vi.advanceTimersByTime(5_000);
		await settle();
		expect(sock.unsubscribeEmits()).toHaveLength(1);
		expect(sock.unsubscribeEmits()[0]!.payload).toEqual({ room: 'protocol' });
	});

	it('grace cancellation: off → useRoom within grace cancels unsubscribe', async () => {
		const { factory, sockets } = makeFactory();
		__setIoFactoryForTests(factory);

		const h1 = realtimeClient.useRoom('protocol');
		flushSync();
		await settle();
		const sock = sockets[0]!;
		expect(sock.subscribeEmits()).toHaveLength(1);

		// Drop refcount to 0; grace timer scheduled.
		h1.off();
		await settle();
		expect(sock.unsubscribeEmits()).toHaveLength(0);

		// 4s pass — grace not yet expired.
		vi.advanceTimersByTime(4_000);

		// Re-enter the room before grace expires → cancels timer, no
		// re-subscribe (already subscribed at SDK level).
		const h2 = realtimeClient.useRoom('protocol');
		flushSync();
		await settle();

		// Walk past the original grace deadline.
		vi.advanceTimersByTime(2_000);
		await settle();

		// No unsubscribe was emitted; subscribe count is still 1 (grace
		// cancellation did NOT trigger a fresh subscribe — refCount went
		// 1 → 0 → 1 but the room never left the activeRooms set since the
		// grace clears the timer before performUnsubscribe runs).
		expect(sock.unsubscribeEmits()).toHaveLength(0);
		// Subscribe count is 1 (initial). Re-entering before grace doesn't
		// re-subscribe since the room ref is still treated as active.
		expect(sock.subscribeEmits()).toHaveLength(1);

		h2.off();
	});

	it('cluster-switch: disconnect + new connect + subscribe in insertion order', async () => {
		const { factory, sockets } = makeFactory();
		__setIoFactoryForTests(factory);

		realtimeClient.useRoom('protocol');
		realtimeClient.useRoom(`pool:${VALID_POOL_A}`);
		flushSync();
		await settle();

		expect(sockets.length).toBe(1);
		const old = sockets[0]!;
		expect(old.subscribeEmits().map((e) => e.payload)).toEqual([
			{ room: 'protocol' },
			{ room: `pool:${VALID_POOL_A}` }
		]);

		// Cluster switch.
		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();

		expect(old.disconnected).toBe(true);
		expect(sockets.length).toBe(2);
		const fresh = sockets[1]!;
		// Re-subscribe in insertion order (insertion-ordered Map).
		expect(fresh.subscribeEmits().map((e) => e.payload)).toEqual([
			{ room: 'protocol' },
			{ room: `pool:${VALID_POOL_A}` }
		]);
	});

	it('late-ack guard: cluster-switch mid-subscribe → old ack dropped', async () => {
		const { factory, sockets } = makeFactory();
		__setIoFactoryForTests(factory);

		realtimeClient.useRoom('protocol');
		flushSync();
		await settle();

		const old = sockets[0]!;
		expect(old.subscribeEmits()).toHaveLength(1);
		const oldAck = old.subscribeEmits()[0]!.ack!;

		// Cluster switch BEFORE the ack lands.
		mockNetworkState.current = 'mainnet';
		flushSync();
		await settle();

		// Now deliver the stale ack — must be a no-op (no error / state change).
		expect(() => oldAck({ ok: true })).not.toThrow();
		await settle();

		// New socket has its own subscribe.
		expect(sockets[1]!.subscribeEmits()).toHaveLength(1);
	});

	it('stale → staleRooms; live → removed (via SDK timer)', async () => {
		const { factory, sockets } = makeFactory();
		__setIoFactoryForTests(factory);

		const room = `pool:${VALID_POOL_A}` as const;
		realtimeClient.useRoom(room);
		flushSync();
		await settle();
		const sock = sockets[0]!;
		// Ack the subscribe so the SDK arms its per-room stale timer.
		sock.ackAllPending();
		await settle();

		// Walk past the 90s stale threshold without any events on the room.
		vi.advanceTimersByTime(95_000);
		await settle();
		expect(realtimeClient.staleRooms.has(room)).toBe(true);

		// Fire a payload event on the pool — the SDK's noteEvent transitions
		// stale → live and emits the synthetic 'live' channel to listeners.
		sock.fire('pool_snapshot', {
			pool: VALID_POOL_A,
			blockTime: Math.floor(Date.now() / 1000),
			tvlA: '0',
			tvlB: '0',
			tvlUsd: null,
			reserveA: '0',
			reserveB: '0',
			feeGrowthA: '0',
			feeGrowthB: '0',
			lpSupply: '0'
		});
		await settle();
		expect(realtimeClient.staleRooms.has(room)).toBe(false);
	});

	it('disconnects underlying socket once refCount drains + grace expires', async () => {
		const { factory, sockets } = makeFactory();
		__setIoFactoryForTests(factory);

		const h = realtimeClient.useRoom('protocol');
		flushSync();
		await settle();
		const sock = sockets[0]!;
		expect(sock.disconnected).toBe(false);

		h.off();
		await settle();
		expect(sock.disconnected).toBe(false);

		vi.advanceTimersByTime(5_000);
		await settle();
		// Per-room unsubscribe fired.
		expect(sock.unsubscribeEmits()).toHaveLength(1);

		// Socket-level disconnect grace runs *also* on a 5s timer; the per-room
		// grace and socket grace can overlap by design — advance another 5s
		// to be sure.
		vi.advanceTimersByTime(5_000);
		await settle();
		expect(sock.disconnected).toBe(true);
	});
});
