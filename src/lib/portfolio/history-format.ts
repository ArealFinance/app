/*
 * Pure helpers for rendering `TransactionRow` values from `@areal/sdk/history`.
 *
 * Display-only — every function is side-effect-free, deterministic, and safe
 * to call during a `$derived` expression. No DOM access, no clock reads
 * outside the one explicit `nowMs` parameter (so tests can control time
 * without mocking `Date.now`).
 */
import type { HistoryKind, TransactionRow } from '@areal/sdk/history';

import type { NetworkId } from '$lib/network/endpoints';

/**
 * Format a Unix-epoch-ms timestamp as a short relative phrase ("5m ago").
 *
 * Buckets:
 *   - clock skew (blockTime > now)   → "just now"
 *   - < 60s                           → "just now"
 *   - < 60m                           → "Nm ago"
 *   - < 24h                           → "Nh ago"
 *   - otherwise                       → "Nd ago"
 *
 * Larger intervals collapse to days — the history list is recent-activity
 * focused; older rows scroll off via cursor pagination, so we don't need
 * weeks/months/years here.
 */
export function relativeTime(blockTimeMs: number, nowMs: number = Date.now()): string {
	const diffMs = nowMs - blockTimeMs;
	if (diffMs < 60_000) return 'just now';
	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/** Human-readable label for a `HistoryKind`. */
export function kindLabel(kind: HistoryKind): string {
	switch (kind) {
		case 'claim':
			return 'Claim';
		case 'swap':
			return 'Swap';
		case 'add_lp':
			return 'Add LP';
		case 'remove_lp':
			return 'Remove LP';
		case 'zap_lp':
			return 'Zap LP';
		case 'mint_rwt':
			return 'Mint RWT';
	}
}

/**
 * Trim trailing zeros / unnecessary decimal point from a server-side decimal
 * string. The history backend returns amounts as already-shifted decimal
 * strings (e.g. "12.500000"), so all we need is cosmetic cleanup.
 *
 * Returns `null` for `null` input so callers can fall back to a placeholder.
 */
function trimAmount(raw: string | null): string | null {
	if (raw === null) return null;
	if (!raw.includes('.')) return raw;
	const trimmed = raw.replace(/0+$/, '').replace(/\.$/, '');
	return trimmed.length === 0 ? '0' : trimmed;
}

/**
 * Compose a one-line description of a `TransactionRow`.
 *
 * Per-kind shapes:
 *   claim     → "Claimed <amountA> RWT"
 *   mint_rwt  → "Minted <amountB> RWT"      (amountA = USDC in, amountB = RWT out)
 *   swap      → "Swapped <amountA> → <amountB>"
 *   add_lp    → "Added LP +<amountA> / +<amountB>"
 *   remove_lp → "Removed LP <amountA> / <amountB>"
 *   zap_lp    → "Zapped LP <amountA> → LP shares"
 *
 * Falls back to the kind label alone when amount fields are missing — the
 * row is still useful (signature, time) even without numeric context.
 */
export function rowDescription(row: TransactionRow): string {
	const a = trimAmount(row.amountA);
	const b = trimAmount(row.amountB);

	switch (row.kind) {
		case 'claim':
			return a !== null ? `Claimed ${a} RWT` : 'Claimed RWT';
		case 'mint_rwt':
			return b !== null ? `Minted ${b} RWT` : 'Minted RWT';
		case 'swap':
			if (a !== null && b !== null) return `Swapped ${a} → ${b}`;
			return 'Swapped';
		case 'add_lp':
			if (a !== null && b !== null) return `Added LP +${a} / +${b}`;
			return 'Added LP';
		case 'remove_lp':
			if (a !== null && b !== null) return `Removed LP ${a} / ${b}`;
			return 'Removed LP';
		case 'zap_lp':
			return a !== null ? `Zapped LP ${a} → LP shares` : 'Zapped LP';
	}
}

/**
 * Build a Solscan transaction link for a signature.
 *
 * - mainnet  → https://solscan.io/tx/<sig>
 * - devnet   → https://solscan.io/tx/<sig>?cluster=devnet
 * - localnet → null (no public explorer; UI hides the link)
 *
 * Defense-in-depth: validates the signature is base58-shaped before composing
 * the URL. The SDK row mapper does not assert the wire payload's signature
 * format, so a malformed (or attacker-controlled) backend response could put
 * `?`/`#`/path segments into the URL. Returning `null` is safer than rendering
 * a broken or spoofed link — the UI falls back to a non-link signature span.
 */
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

export function solscanLink(signature: string, cluster: NetworkId): string | null {
	if (cluster === 'localnet') return null;
	if (!SOLANA_SIG_RE.test(signature)) return null;
	const base = `https://solscan.io/tx/${signature}`;
	return cluster === 'devnet' ? `${base}?cluster=devnet` : base;
}
