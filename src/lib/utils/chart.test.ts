import { describe, it, expect } from 'vitest';
import { chartPoints, chartLinePath, chartAreaPath } from './chart';

describe('chartPoints', () => {
	const box = { width: 100, height: 100 };

	it('returns empty array for empty input', () => {
		expect(chartPoints([], box)).toEqual([]);
	});

	it('handles single-point data without NaN', () => {
		const pts = chartPoints([5], box);
		expect(pts).toHaveLength(1);
		expect(Number.isFinite(pts[0][0])).toBe(true);
		expect(Number.isFinite(pts[0][1])).toBe(true);
		expect(pts[0][0]).toBe(0);
	});

	it('handles all-equal data via range fallback (no NaN)', () => {
		const pts = chartPoints([10, 10, 10], box);
		for (const [x, y] of pts) {
			expect(Number.isFinite(x)).toBe(true);
			expect(Number.isFinite(y)).toBe(true);
		}
	});

	it('places points across the full width', () => {
		const pts = chartPoints([1, 2, 3, 4, 5], box);
		expect(pts[0][0]).toBe(0);
		expect(pts[pts.length - 1][0]).toBe(100);
	});

	it('inverts y so larger values appear higher (smaller y)', () => {
		const pts = chartPoints([1, 10], box);
		expect(pts[1][1]).toBeLessThan(pts[0][1]);
	});

	it('respects padY', () => {
		const pts = chartPoints([1, 10], { width: 100, height: 100, padY: 5 });
		// max value should sit at padY=5, min value at H-padY=95
		expect(pts[1][1]).toBeCloseTo(5, 5);
		expect(pts[0][1]).toBeCloseTo(95, 5);
	});

	it('NaN/Infinity in data corrupt output (caller must sanitize)', () => {
		const pts = chartPoints([1, NaN, 3]);
		// We expect at least one NaN in output — confirms invariant.
		const hasNaN = pts.some(([, y]) => Number.isNaN(y));
		expect(hasNaN).toBe(true);
	});
});

describe('chartLinePath', () => {
	it('empty for empty points', () => {
		expect(chartLinePath([])).toBe('');
	});

	it('starts with M and uses L between points', () => {
		const path = chartLinePath([
			[0, 50],
			[50, 25],
			[100, 0]
		]);
		expect(path).toBe('M 0.00 50.00 L 50.00 25.00 L 100.00 0.00');
	});
});

describe('chartAreaPath', () => {
	it('empty for empty points', () => {
		expect(chartAreaPath([])).toBe('');
	});

	it('closes back along bottom edge', () => {
		const path = chartAreaPath(
			[
				[0, 20],
				[100, 80]
			],
			{ width: 100, height: 100 }
		);
		expect(path.endsWith('L 100 100 L 0 100 Z')).toBe(true);
	});
});
