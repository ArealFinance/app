import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Button from './Button.svelte';
import { textSnippet } from '../../../test-setup';

describe('Button', () => {
	it('renders as <button> by default', () => {
		render(Button, { props: { children: textSnippet('Click me') } });
		const el = screen.getByRole('button');
		expect(el.tagName).toBe('BUTTON');
		expect(el.getAttribute('type')).toBe('button');
	});

	it('renders as <a> when href provided', () => {
		render(Button, { props: { href: '/foo', children: textSnippet('Go') } });
		const el = screen.getByRole('link');
		expect(el.tagName).toBe('A');
		expect(el.getAttribute('href')).toBe('/foo');
	});

	it('applies variant class', () => {
		render(Button, { props: { variant: 'primary', children: textSnippet('X') } });
		expect(screen.getByRole('button').classList.contains('btn-primary')).toBe(true);
	});

	it('size icon does not render label children, only icon slot', () => {
		render(Button, {
			props: {
				size: 'icon',
				'aria-label': 'send',
				children: textSnippet('→')
			}
		});
		const el = screen.getByRole('button');
		// label wrapper not present in icon mode
		expect(el.querySelector('.btn-label')).toBeNull();
	});

	it('full prop applies btn-full class', () => {
		render(Button, { props: { full: true, children: textSnippet('wide') } });
		expect(screen.getByRole('button').classList.contains('btn-full')).toBe(true);
	});

	it('disabled prop disables button', () => {
		render(Button, { props: { disabled: true, children: textSnippet('no') } });
		expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
	});
});
