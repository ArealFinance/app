/*
 * Display-side formatters for the markets pages.
 *
 * Five concerns:
 *   1. `formatTvl`           — USD value to "$1.23M" / "$45.7K" / "$1,234".
 *   2. `formatPrice`         — USD value to "$0.9984" with adaptive precision.
 *   3. `formatTokenAmount`   — bigint base-units to "1.2345" with truncation.
 *   4. `formatPercentage`    — bps (signed) to "+0.57%" / "-1.20%" / "—".
 *   5. `formatFee`           — bps (unsigned) to "0.50%" — no sign, no plus.
 *
 * All formatters return `'—'` for null/undefined input so the UI never has
 * to special-case missing data.
 */

export const EM_DASH = '—';

/**
 * Format a USDC TVL as "$1.23M" / "$45.7K" / "$1,234". Nulls and NaN
 * collapse to em-dash.
 *
 *   - >= 999_500 → "$X.XXM" (2 dp) — boundary is below 1e6 so values that
 *     would otherwise render as "$1000.0K" round into the M branch instead.
 *   - >= 1e3     → "$X.XK"  (1 dp)
 *   - else       → "$1,234" (no decimals, comma-grouped)
 */
export function formatTvl(usdc: number | null | undefined): string {
	if (usdc === null || usdc === undefined || !Number.isFinite(usdc)) return EM_DASH;
	// Threshold is 999_500 (not 1e6) so 999_999 rounds to "$1.00M" rather
	// than overflowing the K branch as "$1000.0K".
	if (usdc >= 999_500) return `$${(usdc / 1_000_000).toFixed(2)}M`;
	if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}K`;
	return `$${Math.round(usdc).toLocaleString('en-US')}`;
}

/**
 * Format a USDC price as "$0.9984" with adaptive precision:
 *
 *   - >= 1000 → "$1,234.56" (2 dp, comma-grouped)
 *   - >= 1    → "$X.XXXX"  (4 dp)
 *   - >= 0.01 → "$X.XXXX"  (4 dp)
 *   - else    → "$X.XXXXXXXX" (8 dp — useful for low-priced tokens)
 *
 * Nulls / NaN collapse to em-dash.
 */
export function formatPrice(usdc: number | null | undefined): string {
	if (usdc === null || usdc === undefined || !Number.isFinite(usdc)) return EM_DASH;
	if (usdc >= 1000) {
		return `$${usdc.toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})}`;
	}
	if (usdc >= 0.01) return `$${usdc.toFixed(4)}`;
	return `$${usdc.toFixed(8)}`;
}

/**
 * Format a base-units bigint into a display string with `decimals` shifted
 * out. Trims trailing zeros, capped at `maxFractionDigits`. Truncates (does
 * NOT round) — never overstate the user's balance.
 *
 * Mirrors the behaviour of `lib/portfolio/format.ts:formatTokenAmount`; the
 * markets module re-implements it locally to keep the two modules
 * dependency-free of each other.
 */
export function formatTokenAmount(
	rawValue: bigint,
	decimals: number,
	maxFractionDigits = 4
): string {
	if (rawValue === 0n) return '0';
	const negative = rawValue < 0n;
	const abs = negative ? -rawValue : rawValue;
	const divisor = 10n ** BigInt(decimals);
	const whole = abs / divisor;
	const frac = abs % divisor;
	let fracStr = frac.toString().padStart(decimals, '0');
	fracStr = fracStr.slice(0, maxFractionDigits).replace(/0+$/, '');
	const sign = negative ? '-' : '';
	return fracStr.length > 0 ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

/**
 * Format a signed bps value as "+0.57%" / "-1.20%". Null collapses to '—'.
 *
 * Signs are explicit (positive values get a leading "+") so the surrounding
 * UI doesn't have to colour the text manually to convey direction. Two
 * fractional digits — bps already has 4-digit precision but we don't surface
 * that to humans.
 */
export function formatPercentage(bps: number | null | undefined): string {
	if (bps === null || bps === undefined || !Number.isFinite(bps)) return EM_DASH;
	const pct = bps / 100;
	const sign = pct > 0 ? '+' : pct < 0 ? '' : '';
	return `${sign}${pct.toFixed(2)}%`;
}

/**
 * Format an unsigned bps value as "0.50%". Used for fee tier display where
 * a leading "+" would be misleading (a fee is not a delta).
 */
export function formatFee(bps: number): string {
	return `${(bps / 100).toFixed(2)}%`;
}

/**
 * Format a holder count compactly:
 *
 *   - <  1_000     → comma-grouped integer ("942", "0")
 *   - <  1_000_000 → "X.YK" with trailing ".0" stripped ("1.2K", "15K")
 *   - else         → "X.YYM" (2 dp, no stripping — matches `formatTvl`)
 *
 * Null / undefined / NaN collapse to em-dash so the UI never has to
 * special-case missing data.
 */
export function formatHolders(n: number | null | undefined): string {
	if (n === null || n === undefined || !Number.isFinite(n)) return EM_DASH;
	if (n < 1_000) return n.toLocaleString('en-US');
	if (n < 1_000_000) {
		return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
	}
	return (n / 1_000_000).toFixed(2) + 'M';
}
