import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { toast } from './toast-store';

describe('toast store', () => {
	beforeEach(() => {
		toast.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts empty', () => {
		expect(get(toast)).toEqual([]);
	});

	it('appends with success/error/warning/info tones', () => {
		toast.success('A');
		toast.error('B');
		toast.warning('C');
		toast.info('D');
		const items = get(toast);
		expect(items.map((t) => t.tone)).toEqual(['success', 'error', 'warning', 'info']);
		expect(items.map((t) => t.body)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('returns a monotonic id from each show', () => {
		const a = toast.success('first');
		const b = toast.success('second');
		expect(b).toBeGreaterThan(a);
	});

	it('auto-dismisses after the default duration', () => {
		toast.success('temp');
		expect(get(toast)).toHaveLength(1);
		vi.advanceTimersByTime(4000);
		expect(get(toast)).toHaveLength(0);
	});

	it('keeps sticky toasts (duration: 0) until manually dismissed', () => {
		const id = toast.warning('stuck', { duration: 0 });
		vi.advanceTimersByTime(60_000);
		expect(get(toast)).toHaveLength(1);
		toast.dismiss(id);
		expect(get(toast)).toHaveLength(0);
	});

	it('dismiss(id) removes only the matching toast', () => {
		const a = toast.success('A');
		const b = toast.success('B');
		toast.dismiss(a);
		const items = get(toast);
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe(b);
	});

	it('dismiss with unknown id is a no-op', () => {
		toast.success('A');
		toast.dismiss(99999);
		expect(get(toast)).toHaveLength(1);
	});

	it('clear() empties the queue', () => {
		toast.success('A');
		toast.error('B');
		toast.clear();
		expect(get(toast)).toEqual([]);
	});

	it('passes through title in opts', () => {
		toast.success('body', { title: 'hello' });
		expect(get(toast)[0].title).toBe('hello');
	});
});
