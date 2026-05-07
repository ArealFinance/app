/*
 * Display-side formatter for raw token amounts.
 *
 * Token balances on Solana are integer base-units (`bigint`). Humans want to
 * see them shifted by `decimals` and trimmed of trailing zeros. Truncation is
 * deliberate: we never round up because that can over-state a holder's
 * balance, and the underlying value is always available via `raw` on the
 * snapshot row when downstream code needs full precision (e.g. claim tx).
 */

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
