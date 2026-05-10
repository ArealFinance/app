import { describe, it, expect } from 'vitest';

import {
	formatTvl,
	formatPrice,
	formatTokenAmount,
	formatPercentage,
	formatFee,
	formatHolders,
	EM_DASH
} from './format';

describe('formatTvl', () => {
	it('returns em-dash for null/undefined/NaN', () => {
		expect(formatTvl(null)).toBe('—');
		expect(formatTvl(undefined)).toBe('—');
		expect(formatTvl(Number.NaN)).toBe('—');
	});

	it('formats values >= 1M with M suffix and 2 dp', () => {
		expect(formatTvl(1_000_000)).toBe('$1.00M');
		expect(formatTvl(2_345_000)).toBe('$2.35M');
		expect(formatTvl(12_500_000)).toBe('$12.50M');
	});

	it('formats values >= 1K with K suffix and 1 dp', () => {
		expect(formatTvl(1_000)).toBe('$1.0K');
		expect(formatTvl(45_700)).toBe('$45.7K');
	});

	it('rounds values just under 1M into the M branch (no "$1000.0K" overflow)', () => {
		expect(formatTvl(999_999)).toBe('$1.00M');
		expect(formatTvl(999_500)).toBe('$1.00M');
		expect(formatTvl(999_499)).toBe('$999.5K');
	});

	it('formats sub-thousand values with comma grouping, no decimals', () => {
		expect(formatTvl(123)).toBe('$123');
		expect(formatTvl(0)).toBe('$0');
	});
});

describe('formatPrice', () => {
	it('returns em-dash for null/undefined/NaN', () => {
		expect(formatPrice(null)).toBe('—');
		expect(formatPrice(undefined)).toBe('—');
		expect(formatPrice(Number.NaN)).toBe('—');
	});

	it('formats >= 1000 with comma grouping + 2 dp', () => {
		expect(formatPrice(1234.56)).toBe('$1,234.56');
		expect(formatPrice(10000)).toBe('$10,000.00');
	});

	it('formats normal range with 4 dp', () => {
		expect(formatPrice(0.9984)).toBe('$0.9984');
		expect(formatPrice(1)).toBe('$1.0000');
		expect(formatPrice(257.98)).toBe('$257.9800');
	});

	it('formats sub-cent values with 8 dp', () => {
		expect(formatPrice(0.00012345)).toBe('$0.00012345');
	});
});

describe('formatTokenAmount', () => {
	it('returns "0" for zero input', () => {
		expect(formatTokenAmount(0n, 6)).toBe('0');
		expect(formatTokenAmount(0n, 0)).toBe('0');
	});

	it('renders whole numbers without decimal point', () => {
		expect(formatTokenAmount(1_000_000n, 6)).toBe('1');
		expect(formatTokenAmount(5_000_000_000n, 9)).toBe('5');
	});

	it('trims trailing zeros from fractional part', () => {
		expect(formatTokenAmount(1_500_000n, 6)).toBe('1.5');
		expect(formatTokenAmount(1_230_000n, 6)).toBe('1.23');
	});

	it('handles decimals=0', () => {
		expect(formatTokenAmount(123n, 0)).toBe('123');
	});

	it('truncates rather than rounds at maxFractionDigits', () => {
		expect(formatTokenAmount(1_999_999n, 6, 2)).toBe('1.99');
		expect(formatTokenAmount(1_987_654n, 6, 4)).toBe('1.9876');
	});

	it('prefixes negative inputs with leading minus', () => {
		expect(formatTokenAmount(-1_500_000n, 6)).toBe('-1.5');
	});
});

describe('formatPercentage', () => {
	it('returns em-dash for null/undefined/NaN', () => {
		expect(formatPercentage(null)).toBe('—');
		expect(formatPercentage(undefined)).toBe('—');
		expect(formatPercentage(Number.NaN)).toBe('—');
	});

	it('prefixes positive values with "+"', () => {
		expect(formatPercentage(57)).toBe('+0.57%');
		expect(formatPercentage(1234)).toBe('+12.34%');
	});

	it('does NOT prefix negative values (the minus is on the number itself)', () => {
		expect(formatPercentage(-57)).toBe('-0.57%');
		expect(formatPercentage(-1200)).toBe('-12.00%');
	});

	it('renders zero as "0.00%" with no sign', () => {
		expect(formatPercentage(0)).toBe('0.00%');
	});
});

describe('formatFee', () => {
	it('formats bps as "X.XX%" with no sign', () => {
		expect(formatFee(50)).toBe('0.50%');
		expect(formatFee(30)).toBe('0.30%');
		expect(formatFee(0)).toBe('0.00%');
		expect(formatFee(100)).toBe('1.00%');
	});
});

describe('formatHolders', () => {
	it('renders sub-thousand counts as comma-grouped integers', () => {
		expect(formatHolders(0)).toBe('0');
		expect(formatHolders(942)).toBe('942');
	});

	it('renders thousands with K suffix and 1 dp, stripping trailing ".0"', () => {
		expect(formatHolders(1234)).toBe('1.2K');
		expect(formatHolders(15_000)).toBe('15K');
	});

	it('renders millions with M suffix and 2 dp', () => {
		expect(formatHolders(2_500_000)).toBe('2.50M');
	});

	it('returns em-dash for null/undefined/NaN', () => {
		expect(formatHolders(null)).toBe(EM_DASH);
		expect(formatHolders(undefined)).toBe(EM_DASH);
		expect(formatHolders(Number.NaN)).toBe(EM_DASH);
	});
});
