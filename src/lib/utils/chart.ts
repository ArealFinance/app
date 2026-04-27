/**
 * Map a 1D numeric series into 2D points within a given W×H box.
 * Used by `<Chart>` to convert `data` into `<polyline>` / `<path>` coordinates.
 *
 * Behavioural notes:
 *  - Empty input → empty output.
 *  - Single point → centered horizontally (x=0), y mid-band; produces just `M`.
 *  - All-equal data → range fallback to 1 (no NaN).
 *  - NaN/Infinity in data are NOT sanitized — caller's job to filter; we surface this in tests.
 */
export interface ChartBox {
	width: number;
	height: number;
	padY?: number;
}

export function chartPoints(
	data: readonly number[],
	box: ChartBox = { width: 100, height: 100 }
): Array<[number, number]> {
	if (!data || data.length === 0) return [];

	const W = box.width;
	const H = box.height;
	const padY = box.padY ?? 2;

	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const stepX = data.length > 1 ? W / (data.length - 1) : 0;

	return data.map<[number, number]>((v, i) => {
		const x = i * stepX;
		const y = H - padY - ((v - min) / range) * (H - padY * 2);
		return [x, y];
	});
}

/** Build an SVG `M ... L ...` path string from points. Empty array → ''. */
export function chartLinePath(points: ReadonlyArray<readonly [number, number]>): string {
	if (points.length === 0) return '';
	return 'M ' + points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ');
}

/** Build an SVG closed area path (line + bottom-edge line + close) from points. */
export function chartAreaPath(
	points: ReadonlyArray<readonly [number, number]>,
	box: ChartBox = { width: 100, height: 100 }
): string {
	const line = chartLinePath(points);
	if (!line) return '';
	return `${line} L ${box.width} ${box.height} L 0 ${box.height} Z`;
}
