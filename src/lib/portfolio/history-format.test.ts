import { describe, it, expect } from 'vitest';

import { kindLabel, relativeTime, rowDescription, solscanLink } from './history-format';
import type { TransactionRow } from '@areal/sdk/history';

const FAKE_SIG =
	'5HiD6dQ7nYr1QBmYZ4PTxxKgTcQ1nQjEaXkPbdghKzHb9eZeJYV8VTGoT7XTnRZSj4xkj4VV6Vbn';

function row(partial: Partial<TransactionRow> & { kind: TransactionRow['kind'] }): TransactionRow {
	return {
		id: '1',
		wallet: '11111111111111111111111111111112',
		otMint: null,
		pool: null,
		amountA: null,
		amountB: null,
		sharesDelta: null,
		signature: FAKE_SIG,
		logIndex: 0,
		blockTime: 0,
		...partial
	};
}

describe('relativeTime', () => {
	const now = 1_700_000_000_000;

	it('returns "just now" for clock skew (blockTime > now)', () => {
		expect(relativeTime(now + 5_000, now)).toBe('just now');
	});

	it('returns "just now" for sub-minute differences', () => {
		expect(relativeTime(now - 30_000, now)).toBe('just now');
		expect(relativeTime(now - 59_000, now)).toBe('just now');
	});

	it('returns "Nm ago" for 1-59 minutes', () => {
		expect(relativeTime(now - 60_000, now)).toBe('1m ago');
		expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago');
		expect(relativeTime(now - 59 * 60_000, now)).toBe('59m ago');
	});

	it('returns "Nh ago" for 1-23 hours', () => {
		expect(relativeTime(now - 60 * 60_000, now)).toBe('1h ago');
		expect(relativeTime(now - 2 * 60 * 60_000, now)).toBe('2h ago');
		expect(relativeTime(now - 23 * 60 * 60_000, now)).toBe('23h ago');
	});

	it('returns "Nd ago" for 1+ days', () => {
		expect(relativeTime(now - 24 * 60 * 60_000, now)).toBe('1d ago');
		expect(relativeTime(now - 3 * 24 * 60 * 60_000, now)).toBe('3d ago');
		expect(relativeTime(now - 30 * 24 * 60 * 60_000, now)).toBe('30d ago');
	});

	it('uses Date.now() when nowMs omitted', () => {
		// Just verify no crash + reasonable value (will be very recent vs now).
		const out = relativeTime(Date.now() - 30_000);
		expect(out).toBe('just now');
	});
});

describe('kindLabel', () => {
	it('returns human label for every kind', () => {
		expect(kindLabel('claim')).toBe('Claim');
		expect(kindLabel('swap')).toBe('Swap');
		expect(kindLabel('add_lp')).toBe('Add LP');
		expect(kindLabel('remove_lp')).toBe('Remove LP');
		expect(kindLabel('zap_lp')).toBe('Zap LP');
		expect(kindLabel('mint_rwt')).toBe('Mint RWT');
	});
});

describe('rowDescription', () => {
	it('formats claim with amountA', () => {
		expect(rowDescription(row({ kind: 'claim', amountA: '12.5' }))).toBe('Claimed 12.5 RWT');
	});

	it('trims trailing zeros from server decimals', () => {
		// Backend returns shifted strings like "12.500000" — the helper should trim.
		expect(rowDescription(row({ kind: 'claim', amountA: '12.500000' }))).toBe('Claimed 12.5 RWT');
		expect(rowDescription(row({ kind: 'claim', amountA: '100.000' }))).toBe('Claimed 100 RWT');
	});

	it('falls back to bare label when amounts are missing', () => {
		expect(rowDescription(row({ kind: 'claim' }))).toBe('Claimed RWT');
		expect(rowDescription(row({ kind: 'swap' }))).toBe('Swapped');
		expect(rowDescription(row({ kind: 'add_lp' }))).toBe('Added LP');
	});

	it('formats swap with both amounts', () => {
		expect(
			rowDescription(row({ kind: 'swap', amountA: '100', amountB: '0.42' }))
		).toBe('Swapped 100 → 0.42');
	});

	it('formats add_lp / remove_lp with both deltas', () => {
		expect(
			rowDescription(row({ kind: 'add_lp', amountA: '100', amountB: '200' }))
		).toBe('Added LP +100 / +200');
		expect(
			rowDescription(row({ kind: 'remove_lp', amountA: '50', amountB: '100' }))
		).toBe('Removed LP 50 / 100');
	});

	it('formats mint_rwt with amountB (RWT out)', () => {
		expect(rowDescription(row({ kind: 'mint_rwt', amountA: '100', amountB: '99.5' }))).toBe(
			'Minted 99.5 RWT'
		);
	});

	it('formats zap_lp with amountA', () => {
		expect(rowDescription(row({ kind: 'zap_lp', amountA: '100' }))).toBe(
			'Zapped LP 100 → LP shares'
		);
	});
});

describe('solscanLink', () => {
	it('returns mainnet URL with no query string for mainnet', () => {
		expect(solscanLink(FAKE_SIG, 'mainnet')).toBe(`https://solscan.io/tx/${FAKE_SIG}`);
	});

	it('returns devnet URL with cluster query string for devnet', () => {
		expect(solscanLink(FAKE_SIG, 'devnet')).toBe(
			`https://solscan.io/tx/${FAKE_SIG}?cluster=devnet`
		);
	});

	it('returns null for localnet (no public explorer)', () => {
		expect(solscanLink(FAKE_SIG, 'localnet')).toBeNull();
	});
});
