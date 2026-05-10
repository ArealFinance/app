import { describe, it, expect } from 'vitest';

import { formatTokenAmount, formatUsd, formatPercent } from './format';

describe('formatTokenAmount', () => {
	it('returns "0" for zero input', () => {
		expect(formatTokenAmount(0n, 6)).toBe('0');
		expect(formatTokenAmount(0n, 0)).toBe('0');
		expect(formatTokenAmount(0n, 18, 8)).toBe('0');
	});

	it('renders whole numbers without a decimal point', () => {
		// 1_000_000 base units at decimals=6 → 1
		expect(formatTokenAmount(1_000_000n, 6)).toBe('1');
		// 5 * 10^9 at decimals=9 → 5
		expect(formatTokenAmount(5_000_000_000n, 9)).toBe('5');
	});

	it('trims trailing zeros from fractional part', () => {
		// 1_500_000 / 10^6 = 1.500000 → trimmed to 1.5
		expect(formatTokenAmount(1_500_000n, 6)).toBe('1.5');
		// 1_230_000 / 10^6 = 1.230000 → 1.23
		expect(formatTokenAmount(1_230_000n, 6)).toBe('1.23');
	});

	it('handles decimals=0 (no shift)', () => {
		expect(formatTokenAmount(123n, 0)).toBe('123');
		expect(formatTokenAmount(1n, 0)).toBe('1');
	});

	it('truncates rather than rounds when over maxFractionDigits', () => {
		// 1.999999 at decimals=6, max=2 → 1.99 (NOT 2.00)
		expect(formatTokenAmount(1_999_999n, 6, 2)).toBe('1.99');
		// 1.987654 at decimals=6, max=4 → 1.9876 (NOT 1.9877)
		expect(formatTokenAmount(1_987_654n, 6, 4)).toBe('1.9876');
		// boundary: 1.123456789, max=3 → 1.123
		expect(formatTokenAmount(1_123_456_789n, 9, 3)).toBe('1.123');
	});

	it('prefixes negative inputs with a leading minus', () => {
		expect(formatTokenAmount(-1_500_000n, 6)).toBe('-1.5');
		expect(formatTokenAmount(-1_000_000n, 6)).toBe('-1');
		expect(formatTokenAmount(-123n, 0)).toBe('-123');
	});

	it('preserves precision below the maxFractionDigits cap', () => {
		// Default cap is 4: 1.23 fits inside it
		expect(formatTokenAmount(1_230_000n, 6)).toBe('1.23');
		// Pad sub-unit values with leading fractional zeros (0.0001 at decimals=6)
		expect(formatTokenAmount(100n, 6)).toBe('0.0001');
		// 0.000001 at decimals=6 default max=4 → all leading-zeros plus the
		// significant digit get truncated → returns '0' (since fracStr after
		// slice(0,4) is "0000" → trimmed to "")
		expect(formatTokenAmount(1n, 6, 4)).toBe('0');
	});
});

describe('formatUsd', () => {
	it('returns em-dash for null / undefined / NaN', () => {
		expect(formatUsd(null)).toBe('—');
		expect(formatUsd(undefined)).toBe('—');
		expect(formatUsd(Number.NaN)).toBe('—');
		expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—');
	});

	it('formats small values with cents precision', () => {
		expect(formatUsd(0)).toBe('$0.00');
		expect(formatUsd(1.5)).toBe('$1.50');
		expect(formatUsd(123.456)).toBe('$123.46');
	});

	it('comma-groups values under the K threshold', () => {
		expect(formatUsd(999.49)).toBe('$999.49');
	});

	it('formats >=1k values in K with one decimal', () => {
		expect(formatUsd(1_000)).toBe('$1.0K');
		expect(formatUsd(12_345)).toBe('$12.3K');
	});

	it('promotes to M at 999_500 to avoid overflowing the K branch', () => {
		expect(formatUsd(999_999)).toBe('$1.00M');
		expect(formatUsd(1_500_000)).toBe('$1.50M');
	});

	it('preserves sign for negative inputs', () => {
		expect(formatUsd(-1.25)).toBe('-$1.25');
		expect(formatUsd(-12_345)).toBe('-$12.3K');
	});
});

describe('formatPercent', () => {
	it('returns em-dash for null / undefined / NaN', () => {
		expect(formatPercent(null)).toBe('—');
		expect(formatPercent(undefined)).toBe('—');
		expect(formatPercent(Number.NaN)).toBe('—');
	});

	it('formats values with two fractional digits', () => {
		expect(formatPercent(0)).toBe('0.00%');
		expect(formatPercent(1.5)).toBe('1.50%');
		expect(formatPercent(12.345)).toBe('12.35%');
	});

	it('preserves sign for negative inputs', () => {
		expect(formatPercent(-1.5)).toBe('-1.50%');
	});
});
