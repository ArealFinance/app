/*
 * Wallet-room transaction-indexed toast handler.
 *
 * Extracted from `routes/portfolio/+page.svelte` so the validation,
 * dedupe, FIFO cap, and visibility-gate logic can be unit-tested in
 * isolation. The handler is dependency-injected: callers pass the
 * `toast` surface, the `network` store (for the explorer cluster
 * suffix), and optional `isHidden` / `now` overrides for tests.
 *
 * Defence-in-depth (R-FU-5): even though the realtime adapter only
 * binds to wallet:<base58> rooms after auth, we shape-check the
 * `signature` and `kind` fields before letting them reach the toast
 * body. Today auto-escape protects rendering — the explicit guard is
 * cheap and rules out an entire class of injection in case anyone
 * later wires this into a non-escaping surface.
 *
 * Memory cap (R-FU-6): the dedupe Map has a TTL, but a sustained burst
 * of unique signatures could still bloat the Map until GC catches up.
 * A FIFO eviction at 256 entries bounds worst-case memory.
 */
import type { TransactionIndexedEvent } from '@areal/sdk/realtime';

/**
 * Solana transaction signatures are 64 bytes, base58-encoded — typically
 * 87-88 chars. Allow 64-90 to cover edge cases and future-proof against
 * any minor encoding quirk; reject anything outside the base58 alphabet.
 */
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

const VALID_KINDS = new Set<TransactionIndexedEvent['kind']>([
	'claim',
	'swap',
	'add_lp',
	'remove_lp',
	'zap_lp',
	'mint_rwt'
]);

type ValidKind = TransactionIndexedEvent['kind'];

const KIND_COPY: Record<ValidKind, string> = {
	claim: 'Rewards claimed',
	swap: 'Swap confirmed',
	add_lp: 'Liquidity added',
	remove_lp: 'Liquidity removed',
	zap_lp: 'Zap confirmed',
	mint_rwt: 'RWT minted'
};

/** Hard cap on dedupe Map size before FIFO eviction kicks in. */
const RECENT_SIGS_MAX = 256;
/** TTL after which a recorded signature can ring the toast again. */
const SIG_TTL_MS = 5 * 60 * 1000;

export interface ToastSurface {
	success(body: string, opts?: { title?: string; duration?: number }): void;
}

export interface TxToastDeps {
	toast: ToastSurface;
	/**
	 * Reactive accessor for the current cluster id. Read at toast-fire
	 * time so a cluster switch picks up the new value.
	 */
	network: { readonly current: string };
	/** Override for tests. Defaults to `document.visibilityState !== 'visible'`. */
	isHidden?: () => boolean;
	/** Override for tests. Defaults to Date.now. */
	now?: () => number;
}

export interface TxToastHandler {
	handle(payload: TransactionIndexedEvent): void;
	/** @internal — test-only inspection of the dedupe map. */
	__peekRecentSigs(): ReadonlyMap<string, number>;
}

export function createTxToastHandler(deps: TxToastDeps): TxToastHandler {
	const recentSigs = new Map<string, number>();
	const isHidden =
		deps.isHidden ??
		(() => typeof document !== 'undefined' && document.visibilityState !== 'visible');
	const now = deps.now ?? Date.now;

	return {
		handle(payload) {
			// R-FU-5 — fail fast on malformed payloads. Auto-escape protects
			// us from XSS today; this is defence-in-depth so we don't depend
			// on the rendering surface to be safe.
			if (!SIGNATURE_RE.test(payload.signature)) {
				console.warn('[tx-toast] dropped: invalid signature shape');
				return;
			}
			if (!VALID_KINDS.has(payload.kind as ValidKind)) {
				console.warn(`[tx-toast] dropped: unknown kind ${payload.kind}`);
				return;
			}

			// Visibility gate — toasts surfaced in a hidden tab go unseen.
			if (isHidden()) return;

			// GC stale entries BEFORE the dedupe check so a signature whose
			// TTL just expired can re-fire a toast (indexer rebroadcast on
			// long retry loops).
			const ts = now();
			for (const [sig, recordedAt] of recentSigs) {
				if (ts - recordedAt > SIG_TTL_MS) recentSigs.delete(sig);
			}

			// Dedupe within TTL.
			if (recentSigs.has(payload.signature)) return;
			recentSigs.set(payload.signature, ts);

			// R-FU-6 — FIFO cap. JS Maps preserve insertion order, so
			// keys().next() yields the oldest entry.
			if (recentSigs.size > RECENT_SIGS_MAX) {
				const oldest = recentSigs.keys().next().value as string | undefined;
				if (oldest !== undefined) recentSigs.delete(oldest);
			}

			// Build + surface the toast.
			const title = KIND_COPY[payload.kind as ValidKind];
			const sigShort = `${payload.signature.slice(0, 4)}…${payload.signature.slice(-4)}`;
			const url = `https://solscan.io/tx/${payload.signature}?cluster=${deps.network.current}`;
			deps.toast.success(`${sigShort} · ${url}`, { title });
		},
		__peekRecentSigs: () => recentSigs
	};
}
