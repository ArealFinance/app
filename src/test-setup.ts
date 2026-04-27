/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { Snippet } from 'svelte';

afterEach(() => {
	cleanup();
});

/**
 * Test helper — wrap a plain string into a Snippet so it can be passed
 * as a `children`/slot prop in @testing-library/svelte's `render()`.
 */
export function textSnippet(text: string): Snippet {
	return createRawSnippet(() => ({ render: () => text }));
}
