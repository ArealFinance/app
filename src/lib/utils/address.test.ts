import { describe, it, expect } from 'vitest';
import { truncateAddress } from './address';

describe('truncateAddress', () => {
	it('returns empty string for empty input', () => {
		expect(truncateAddress('')).toBe('');
	});

	it('passes through addresses shorter than the truncation budget', () => {
		expect(truncateAddress('abc')).toBe('abc');
		expect(truncateAddress('1234567890', 4)).toBe('1234567890'); // 10 chars, threshold 11
	});

	it('returns full address at exact threshold (n*2+3)', () => {
		const exact = 'a'.repeat(11); // 4*2+3 = 11
		expect(truncateAddress(exact, 4)).toBe(exact);
	});

	it('truncates a long address into prefix…suffix', () => {
		const addr = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
		expect(truncateAddress(addr, 4)).toBe('DYw8…NSKK');
	});

	it('respects the n parameter', () => {
		const addr = 'AABBCCDDEEFFGGHHIIJJKKLLMM';
		expect(truncateAddress(addr, 2)).toBe('AA…MM');
		expect(truncateAddress(addr, 6)).toBe('AABBCC…HHIIJJ'.slice(0, 6) + '…' + addr.slice(-6));
	});

	it('default n=4', () => {
		const addr = 'abcdefghijklmnopqrstuvwxyz';
		expect(truncateAddress(addr)).toBe('abcd…wxyz');
	});
});
