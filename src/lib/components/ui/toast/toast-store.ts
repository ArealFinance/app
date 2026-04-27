/*
 * Global toast queue. Use:
 *   import { toast } from '$lib/components/ui';
 *   toast.success('Stake successful');
 *   toast.error('Network error', { duration: 5000 });
 *
 * Mount <Toaster /> once in +layout.svelte (or wherever appropriate).
 */
import { writable } from 'svelte/store';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastEntry {
	id: number;
	tone: ToastTone;
	title?: string;
	body: string;
	duration: number; // ms; 0 = sticky
}

interface ShowOptions {
	title?: string;
	duration?: number;
}

const DEFAULT_DURATION = 4000;

function createToastStore() {
	const { subscribe, update } = writable<ToastEntry[]>([]);

	let nextId = 1;

	function dismiss(id: number) {
		update((items) => items.filter((t) => t.id !== id));
	}

	function show(tone: ToastTone, body: string, opts: ShowOptions = {}) {
		const id = nextId++;
		const duration = opts.duration ?? DEFAULT_DURATION;
		const entry: ToastEntry = {
			id,
			tone,
			title: opts.title,
			body,
			duration
		};
		update((items) => [...items, entry]);
		if (duration > 0 && typeof window !== 'undefined') {
			setTimeout(() => dismiss(id), duration);
		}
		return id;
	}

	return {
		subscribe,
		dismiss,
		clear: () => update(() => []),
		success: (body: string, opts?: ShowOptions) => show('success', body, opts),
		error: (body: string, opts?: ShowOptions) => show('error', body, opts),
		warning: (body: string, opts?: ShowOptions) => show('warning', body, opts),
		info: (body: string, opts?: ShowOptions) => show('info', body, opts)
	};
}

export const toast = createToastStore();
