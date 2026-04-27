import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import StatusPill from './StatusPill.svelte';
import { textSnippet } from '../../../test-setup';

describe('StatusPill', () => {
	it('applies variant + tone + size classes', () => {
		const { container } = render(StatusPill, {
			props: { variant: 'tonal', tone: 'success', size: 'md', children: textSnippet('+0.57%') }
		});
		const pill = container.querySelector('.pill')!;
		expect(pill.classList.contains('pill-tonal')).toBe(true);
		expect(pill.classList.contains('tone-success')).toBe(true);
		expect(pill.classList.contains('size-md')).toBe(true);
	});

	it('renders dot marker only for variant=dot', () => {
		const { container: tonal } = render(StatusPill, {
			props: { variant: 'tonal', tone: 'success', children: textSnippet('x') }
		});
		expect(tonal.querySelector('.pill-dot-marker')).toBeNull();

		const { container: dot } = render(StatusPill, {
			props: { variant: 'dot', tone: 'success', children: textSnippet('x') }
		});
		expect(dot.querySelector('.pill-dot-marker')).not.toBeNull();
	});

	it('defaults to neutral/sm when unspecified', () => {
		const { container } = render(StatusPill, { props: { children: textSnippet('plain') } });
		const pill = container.querySelector('.pill')!;
		expect(pill.classList.contains('pill-neutral')).toBe(true);
		expect(pill.classList.contains('size-sm')).toBe(true);
	});

	it('uppercases label text in dot variant via CSS class', () => {
		// CSS-driven, but we can at least confirm `.pill-dot` is set so the
		// `text-transform: uppercase` rule applies.
		const { container } = render(StatusPill, {
			props: { variant: 'dot', children: textSnippet('stable') }
		});
		expect(container.querySelector('.pill-dot')).not.toBeNull();
	});
});
