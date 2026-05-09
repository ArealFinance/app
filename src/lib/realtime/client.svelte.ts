/*
 * Realtime client — runes-based singleton with ref-counted room subscriptions.
 *
 * Owns the single `@areal/sdk/realtime` socket per cluster. Mirrors the
 * discipline of `portfolio/history.svelte.ts`:
 *
 *   - Late-response guard via `connectionToken`. A `disconnect()` (cluster
 *     switch, full teardown) bumps the token; ack handlers compare captured
 *     token vs current and silently drop on mismatch.
 *   - Ref-counted rooms: `useRoom('pool:X')` ++/-- counters in an
 *     insertion-ordered Map. Subscribe is emitted only on 0→1 transitions;
 *     unsubscribe is scheduled with a 5s grace window on 1→0 so a quick
 *     remount doesn't churn the server.
 *   - Cluster source: `network.current` from `network.svelte`. `$effect.root`
 *     watches; on switch we disconnect + reconnect + replay all
 *     active-room subscriptions in insertion order.
 *
 * Public surface:
 *   realtimeClient.{useRoom, on, staleRooms, lastConnectError, connected}
 *
 * Q4 (architect): public rooms only this phase — `protocol`, `pool:<base58>`.
 * `wallet:<...>` rooms are deferred to 12.3.4 (no JWT auth-store yet).
 */
import type {
	IoFactory,
	RealtimeClient as SdkRealtimeClient,
	RealtimeEventMap,
	Room
} from '@areal/sdk/realtime';
import { connect } from '@areal/sdk/realtime';
import { env as publicEnv } from '$env/dynamic/public';

import { network } from '$lib/network/network.svelte';
import { auth } from '$lib/auth';

/** Stable global stale threshold — covers 30s `protocol` and 60s `pool:*`. */
const STALE_AFTER_MS = 90_000;

/** Grace window before unsubscribing a 1→0 room. */
const UNSUBSCRIBE_GRACE_MS = 5_000;

export interface RealtimeHandle {
	/** Idempotent — calling twice is a no-op. */
	off(): void;
}

export interface RealtimeClientStore {
	/**
	 * Acquire a reference to a room. Subscribes the underlying socket on
	 * 0→1 transition; `off()` decrements and (after a 5s grace) unsubscribes
	 * on 1→0.
	 */
	useRoom(room: Room): RealtimeHandle;
	/**
	 * Set of rooms the SDK has marked stale (no events within
	 * `staleAfterMs`). Mirrors the SDK's `stale`/`live` events.
	 */
	readonly staleRooms: ReadonlySet<Room>;
	/** Last `connect_error` message (token-redacted by the SDK), or `null`. */
	readonly lastConnectError: string | null;
	readonly connected: boolean;
	/** Subscribe to a payload channel. Returns an unsubscribe fn. */
	on<K extends keyof RealtimeEventMap>(
		channel: K,
		listener: (payload: RealtimeEventMap[K]) => void
	): () => void;
}

// Reactive surface. Read-only outwards.
let staleRooms: Set<Room> = $state(new Set());
let lastConnectError: string | null = $state(null);
let connected: boolean = $state(false);

// Mutable bookkeeping (NOT reactive — never read from `$derived`).
let client: SdkRealtimeClient | null = null;
let connectionToken: number = 0;
const activeRooms = new Map<Room, number>();
const pendingUnsubscribes = new Map<Room, ReturnType<typeof setTimeout>>();
let stopEffect: (() => void) | null = null;
let listenerCleanups: Array<() => void> = [];

/** Optional injection point for tests. */
let ioFactoryOverride: IoFactory | null = null;

/** @internal — test-only. */
export function __setIoFactoryForTests(factory: IoFactory | null): void {
	ioFactoryOverride = factory;
}

/**
 * Resolve the `/realtime` baseUrl.
 *
 * Order:
 *   1. PUBLIC_REALTIME_WS_URL env override (deploy-time tweak).
 *   2. REALTIME_WS_URLS[network.current] from the SDK.
 *
 * Returns `null` when neither produces a non-empty string. Caller surfaces
 * "Unknown cluster" so the user sees an actionable error rather than the
 * raw SDK TypeError.
 */
let warnedHttpOverride = false;

function resolveBaseUrl(): string | null {
	const override = publicEnv.PUBLIC_REALTIME_WS_URL;
	if (override && override.length > 0) {
		// Production deploys must use wss://. Warn once if a plain `ws://`
		// override leaked into a prod build (operator misconfig).
		if (
			!warnedHttpOverride &&
			import.meta.env.PROD &&
			!override.startsWith('wss://')
		) {
			warnedHttpOverride = true;
			// eslint-disable-next-line no-console
			console.warn(
				'[realtime] PUBLIC_REALTIME_WS_URL is non-WSS in production build:',
				override
			);
		}
		return override;
	}
	// Resolve via the local NetworkEndpoint instead of the SDK's stale
	// `REALTIME_WS_URLS` map (its `localnet` slot points at
	// `ws://localhost:3010/realtime`, wrong for our public Testnet build).
	const fromCluster = network.endpoint.realtimeWsUrl;
	if (fromCluster && fromCluster.length > 0) return fromCluster;
	return null;
}

/** Tear down the live socket + listeners. Bumps the connection token. */
function teardownClient(): void {
	connectionToken++;
	for (const cleanup of listenerCleanups) cleanup();
	listenerCleanups = [];
	for (const t of pendingUnsubscribes.values()) clearTimeout(t);
	pendingUnsubscribes.clear();
	if (client) {
		try {
			client.disconnect();
		} catch {
			// Defensive — the SDK's disconnect is idempotent in practice.
		}
	}
	client = null;
	connected = false;
	staleRooms = new Set();
}

/** Spin up a fresh socket and replay every active-room subscription. */
function setupClient(): void {
	const baseUrl = resolveBaseUrl();
	if (baseUrl === null) {
		lastConnectError = 'Unknown cluster';
		return;
	}

	const tokenAtConnect = ++connectionToken;
	const accessToken = auth.accessToken;
	let next: SdkRealtimeClient;
	try {
		next = connect({
			baseUrl,
			staleAfterMs: STALE_AFTER_MS,
			...(accessToken ? { token: accessToken } : {}),
			...(ioFactoryOverride !== null ? { ioFactory: ioFactoryOverride } : {})
		});
	} catch (e) {
		lastConnectError = e instanceof Error ? e.message : String(e);
		return;
	}
	client = next;
	lastConnectError = null;

	// Subscribe-state bookkeeping. Emit subscribes in insertion order so a
	// reconnect replays deterministically.
	listenerCleanups.push(
		next.on('connect_error', (payload) => {
			if (tokenAtConnect !== connectionToken) return;
			lastConnectError = payload.message;
		})
	);
	listenerCleanups.push(
		next.on('stale', (payload) => {
			if (tokenAtConnect !== connectionToken) return;
			const ns = new Set(staleRooms);
			ns.add(payload.room);
			staleRooms = ns;
		})
	);
	listenerCleanups.push(
		next.on('live', (payload) => {
			if (tokenAtConnect !== connectionToken) return;
			if (!staleRooms.has(payload.room)) return;
			const ns = new Set(staleRooms);
			ns.delete(payload.room);
			staleRooms = ns;
		})
	);

	// `connected` flag: poll at micro-task resolution so tests can drive
	// FakeSocket.fire('connect') deterministically. The SDK doesn't expose
	// a `connect`/`disconnect` event channel today (only payload channels +
	// synthetic stale/live/connect_error), but `client.connected` is
	// readable. We mirror it via a small re-check on every payload event.
	const sync = () => {
		if (tokenAtConnect !== connectionToken) return;
		connected = next.connected;
	};
	sync();

	// Replay active rooms in insertion order. We don't await — socket.io
	// buffers emits before handshake completes, so replays land in order.
	// Skip rooms whose refCount has dropped to 0 (sitting in grace) — those
	// will be unsubscribed on grace expiry; resubscribing first wastes a
	// round-trip.
	for (const [room, refCount] of activeRooms) {
		if (refCount <= 0) continue;
		void next
			.subscribe(room)
			.then(() => sync())
			.catch(() => {
				if (tokenAtConnect !== connectionToken) return;
			});
	}
}

/**
 * Cluster identity tracked across the lifetime of the socket. `null` means
 * "no socket built yet". Bumping `network.current` to a different value
 * tears down + rebuilds; same-value re-runs of the effect are no-ops.
 */
let activeCluster: string | null = null;

/**
 * Access token of the currently-live socket. Per SDK 0.10.x contract there
 * is no `setToken()` — rotation requires `disconnect()` + `connect()`. The
 * auth-watch effect compares this against `auth.accessToken` and rebuilds
 * the socket on a real change.
 */
let activeAccessToken: string | null = null;

/** Cluster-switch effect body. Track `network.current` reactively. */
function effectBody() {
	const next = network.current;
	if (activeCluster === null) {
		// First run with consumers waiting OR no consumers — defer connect
		// until the first useRoom call.
		if (countLiveRooms() > 0) {
			setupClient();
			activeCluster = next;
			activeAccessToken = auth.accessToken;
		}
		return;
	}
	if (activeCluster === next) return;
	// Real cluster switch.
	teardownClient();
	activeCluster = next;
	if (countLiveRooms() > 0) {
		setupClient();
		activeAccessToken = auth.accessToken;
	} else {
		activeCluster = null;
		activeAccessToken = null;
	}
}

/**
 * Auth-token-rotation effect body. The realtime SDK has no `setToken()`,
 * so a token change requires a full disconnect+reconnect cycle. We do
 * NOT rebuild when there are no live rooms — the token will be picked up
 * by the next `useRoom` / `on` call as part of `setupClient`.
 */
function authEffectBody() {
	const next = auth.accessToken;
	if (next === activeAccessToken) return;
	if (client === null) {
		// No live socket; nothing to rotate. Refresh the recorded value so
		// future no-op effect runs don't trigger spurious teardowns.
		activeAccessToken = next;
		return;
	}
	teardownClient();
	activeAccessToken = next;
	if (countLiveRooms() > 0) {
		setupClient();
	} else {
		activeCluster = null;
		activeAccessToken = null;
	}
}

function ensureEffectRoot(): void {
	if (stopEffect !== null) return;
	stopEffect = $effect.root(() => {
		$effect(() => {
			effectBody();
		});
		$effect(() => {
			authEffectBody();
		});
	});
}

function ensureClient(): void {
	if (client !== null) return;
	setupClient();
	activeCluster = network.current;
	activeAccessToken = auth.accessToken;
}

function performUnsubscribe(room: Room): void {
	pendingUnsubscribes.delete(room);
	// Architect-locked semantics: a room with refCount 0 stays in
	// `activeRooms` (with count 0) during the grace window, so a remount
	// can short-circuit without re-emitting subscribe. The grace timer
	// fully removes it on expiry.
	const cur = activeRooms.get(room);
	if (cur !== 0) return; // someone re-acquired during grace; bail.
	activeRooms.delete(room);
	if (!client) return;
	void client.unsubscribe(room).catch(() => {
		// Idempotent at the adapter level — silent on failure.
	});
}

function useRoom(room: Room): RealtimeHandle {
	ensureEffectRoot();

	// Wallet-room gating. `wallet:<base58>` rooms require an authenticated
	// socket where `jwt.sub === <base58>`. If we have no signed-in session
	// (or the session is for a different wallet) we DO NOT emit subscribe —
	// the server would reject with `auth_required`/`auth_mismatch` anyway,
	// and emitting the doomed subscribe would just spam the connect-error
	// channel. Returning a no-op handle keeps the call site uniform.
	//
	/**
	 * Wallet-room subscriptions are NOT reactive to `auth` state.
	 *
	 * Calling `useRoom('wallet:X')` while signed-out (or signed-in for a
	 * different wallet) returns a no-op handle that NEVER reanimates if
	 * auth state flips. Consumers must re-call `useRoom` from a `$effect`
	 * watching `auth.isSignedInForCurrentWallet`. See `routes/portfolio/
	 * +page.svelte` for the canonical pattern.
	 *
	 * Why this design (and not auto-resubscribe inside the client):
	 *   - 0→1 ref-count semantics drive subscribe-emit; auto-flip would
	 *     break the invariant "subscribe only on cold-start of a room".
	 *   - Auth-driven resubscribe lifetime belongs to the consumer's
	 *     mount/unmount window, not to a global client.
	 */
	if (room.startsWith('wallet:')) {
		const expected = room.slice('wallet:'.length);
		if (auth.wallet !== expected || !auth.isSignedIn) {
			return { off() {} };
		}
	}

	// Cancel any pending unsubscribe — we're back in the active set.
	const pending = pendingUnsubscribes.get(room);
	if (pending !== undefined) {
		clearTimeout(pending);
		pendingUnsubscribes.delete(room);
	}

	const prev = activeRooms.get(room) ?? 0;
	activeRooms.set(room, prev + 1);
	// `prev === 0` BUT room exists in map → grace-cancellation: room is
	// already subscribed, just bump refCount. `prev === 0` AND room absent
	// from map (handled by `?? 0` above) → first-time subscribe.
	const wasGraceCancelled = pending !== undefined && prev === 0;
	if (prev === 0 && !wasGraceCancelled) {
		const hadClient = client !== null;
		ensureClient();
		// If `ensureClient` *just* created the socket, `setupClient` already
		// replayed every active room (including this one) — emit subscribe
		// only when the client pre-existed.
		if (hadClient && client) {
			const tokenAtSubscribe = connectionToken;
			void client
				.subscribe(room)
				.then(() => {
					if (tokenAtSubscribe !== connectionToken) return;
					connected = client?.connected ?? false;
				})
				.catch(() => {
					if (tokenAtSubscribe !== connectionToken) return;
				});
		}
	}

	let off = false;
	return {
		off() {
			if (off) return;
			off = true;
			const cur = activeRooms.get(room) ?? 0;
			if (cur <= 1) {
				activeRooms.set(room, 0);
				// Schedule unsubscribe with a grace window so a remount
				// (e.g. component re-rendered in <5s) doesn't churn the server.
				const t = setTimeout(() => performUnsubscribe(room), UNSUBSCRIBE_GRACE_MS);
				pendingUnsubscribes.set(room, t);

				// If this is the LAST live consumer (every room hit 0), schedule
				// a socket-level teardown after the grace expires. The check at
				// fire-time gates on `activeRooms.size === 0` AND every count
				// being 0 — handles the case where a different room was
				// re-acquired during the grace window.
				const liveCount = countLiveRooms();
				if (liveCount === 0) {
					setTimeout(() => {
						if (countLiveRooms() === 0) {
							teardownClient();
							activeRooms.clear();
							activeCluster = null;
						}
					}, UNSUBSCRIBE_GRACE_MS);
				}
			} else {
				activeRooms.set(room, cur - 1);
			}
		}
	};
}

/** Sum of refCounts across all rooms. Zero means socket can wind down. */
function countLiveRooms(): number {
	let n = 0;
	for (const v of activeRooms.values()) n += v;
	return n;
}

function on<K extends keyof RealtimeEventMap>(
	channel: K,
	listener: (payload: RealtimeEventMap[K]) => void
): () => void {
	ensureEffectRoot();
	ensureClient();
	if (!client) {
		// Failed to connect (e.g. unknown cluster) — return a no-op unsubscribe.
		return () => {};
	}
	const tokenAtAttach = connectionToken;
	const off = client.on(channel, (payload) => {
		// Late-attach guard: the listener is bound to a specific socket.
		// On cluster switch the socket is replaced, but the SDK already
		// drops listeners as part of `disconnect()`. The token check is
		// belt-and-braces.
		if (tokenAtAttach !== connectionToken) return;
		listener(payload);
		connected = client?.connected ?? false;
	});
	return off;
}

/**
 * Test-only: full reset. Drains all active rooms, cancels grace timers,
 * tears down the socket, and stops the cluster-watch effect.
 *
 * @internal
 */
export function __resetRealtimeForTests(): void {
	teardownClient();
	activeRooms.clear();
	activeCluster = null;
	activeAccessToken = null;
	if (stopEffect) {
		stopEffect();
		stopEffect = null;
	}
	lastConnectError = null;
}

export const realtimeClient: RealtimeClientStore = {
	useRoom,
	get staleRooms(): ReadonlySet<Room> {
		return staleRooms;
	},
	get lastConnectError(): string | null {
		return lastConnectError;
	},
	get connected(): boolean {
		return connected;
	},
	on
};
