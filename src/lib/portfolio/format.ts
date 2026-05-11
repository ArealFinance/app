/*
 * Display-side formatter for raw token amounts.
 *
 * Token balances on Solana are integer base-units (`bigint`). Humans want to
 * see them shifted by `decimals` and trimmed of trailing zeros. Truncation is
 * deliberate: we never round up because that can over-state a holder's
 * balance, and the underlying value is always available via `raw` on the
 * snapshot row when downstream code needs full precision (e.g. claim tx).
 */

const EM_DASH = '—';

/**
 * Format a base-units bigint into a display string with `decimals` shifted out.
 * Trims trailing zeros, capped at `maxFractionDigits`. Truncates (does NOT round).
 */
export function formatTokenAmount(
	raw: bigint,
	decimals: number,
	maxFractionDigits = 4
): string {
	if (raw === 0n) return '0';
	const negative = raw < 0n;
	const abs = negative ? -raw : raw;
	const divisor = 10n ** BigInt(decimals);
	const whole = abs / divisor;
	const frac = abs % divisor;
	let fracStr = frac.toString().padStart(decimals, '0');
	fracStr = fracStr.slice(0, maxFractionDigits).replace(/0+$/, '');
	const sign = negative ? '-' : '';
	return fracStr.length > 0 ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

/**
 * Format a USD amount with magnitude scaling for the portfolio surface.
 *
 *   - >= 999_500 → "$X.XXM" (2 dp)
 *   - >= 1_000   → "$X.XK"  (1 dp)
 *   - else       → "$X.XX"  (2 dp, comma-grouped)
 *
 * Differs from `markets/format.ts:formatTvl` only in the small branch:
 * portfolio surfaces value at human-cash precision ($0.00) where the
 * markets surface rounds to whole dollars. Magnitude bands are otherwise
 * identical.
 *
 * Null / undefined / NaN collapse to `fallback` (default em-dash). Pass
 * `'$0.00'` (or similar) where the surface should treat "no data" as
 * "zero" rather than "unknown" — portfolio stats blocks read better as
 * a concrete zero than as a vague em-dash.
 */
export function formatUsd(
	value: number | null | undefined,
	fallback: string = EM_DASH
): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
	const sign = value < 0 ? '-' : '';
	const abs = Math.abs(value);
	if (abs >= 999_500) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
	if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
	return `${sign}$${abs.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;
}

/**
 * Format a percentage value (already in percent units, e.g. 1.5 = 1.5%).
 * Two fractional digits; no leading sign for negatives is suppressed —
 * the toFixed default already prints a leading `-` for negatives.
 *
 * Null / undefined / NaN collapse to `fallback` (default em-dash). Same
 * rationale as `formatUsd` — portfolio surfaces pass `'0.00%'` to make
 * "no APY data" render as a concrete zero instead of an ambiguous dash.
 */
export function formatPercent(
	value: number | null | undefined,
	fallback: string = EM_DASH
): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
	return `${value.toFixed(2)}%`;
}
