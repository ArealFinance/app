/*
 * Test-only stub for `$lib/realtime/client.svelte`.
 *
 * Lives in a `.svelte.ts` file so the reactive `staleRooms` $state proxy
 * can be observed by the snapshot store's $effect on cluster/stale.
 *
 * Surface mirrors the real `realtimeClient`:
 *   - useRoom(room) → returns a `{off()}` handle.
 *   - on(channel, listener) → returns an unsubscribe fn.
 *   - readonly staleRooms / lastConnectError / connected.
 *
 * Plus test-only helpers:
 *   - __emit(channel, payload) — synthesise a payload arrival.
 *   - __setStale(room, on) — flip a room's stale flag.
 */
import type { Room, RealtimeEventMap } from '@areal/sdk/realtime';

type Listener = (payload: unknown) => void;

const listeners = new Map<keyof RealtimeEventMap, Set<Listener>>();
let staleRooms: Set<Room> = $state(new Set());
let lastConnectError: string | null = $state(null);
let connected: boolean = $state(true);
const useRoomLog: Room[] = [];
const offLog: Room[] = [];

export const realtimeClientStub = {
	useRoom(room: Room) {
		useRoomLog.push(room);
		return {
			off() {
				offLog.push(room);
			}
		};
	},
	on<K extends keyof RealtimeEventMap>(
		channel: K,
		listener: (payload: RealtimeEventMap[K]) => void
	): () => void {
		let set = listeners.get(channel);
		if (!set) {
			set = new Set();
			listeners.set(channel, set);
		}
		set.add(listener as Listener);
		return () => {
			set!.delete(listener as Listener);
		};
	},
	get staleRooms(): ReadonlySet<Room> {
		return staleRooms;
	},
	get lastConnectError(): string | null {
		return lastConnectError;
	},
	get connected(): boolean {
		return connected;
	},

	// ────────── test-only helpers ──────────
	__emit<K extends keyof RealtimeEventMap>(channel: K, payload: RealtimeEventMap[K]): void {
		const set = listeners.get(channel);
		if (!set) return;
		for (const fn of Array.from(set)) {
			fn(payload);
		}
	},
	__setStale(room: Room, on: boolean): void {
		const next = new Set(staleRooms);
		if (on) next.add(room);
		else next.delete(room);
		staleRooms = next;
	},
	__useRoomLog(): readonly Room[] {
		return useRoomLog;
	},
	__offLog(): readonly Room[] {
		return offLog;
	}
};

export function resetRealtimeClientStub(): void {
	listeners.clear();
	staleRooms = new Set();
	lastConnectError = null;
	connected = true;
	useRoomLog.length = 0;
	offLog.length = 0;
}
