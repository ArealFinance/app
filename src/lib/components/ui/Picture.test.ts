import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Picture from './Picture.svelte';

describe('Picture', () => {
	it('renders <picture> with avif + webp <source> and <img> fallback', () => {
		const { container } = render(Picture, {
			props: { src: '/images/hero/crystal-composite.png', alt: 'crystal' }
		});

		const picture = container.querySelector('picture');
		expect(picture).not.toBeNull();

		const sources = picture!.querySelectorAll('source');
		expect(sources).toHaveLength(2);

		const avifSource = sources[0];
		expect(avifSource.getAttribute('type')).toBe('image/avif');
		expect(avifSource.getAttribute('srcset')).toBe('/images/hero/crystal-composite.avif');

		const webpSource = sources[1];
		expect(webpSource.getAttribute('type')).toBe('image/webp');
		expect(webpSource.getAttribute('srcset')).toBe('/images/hero/crystal-composite.webp');

		const img = picture!.querySelector('img')!;
		expect(img.getAttribute('src')).toBe('/images/hero/crystal-composite.png');
		expect(img.getAttribute('alt')).toBe('crystal');
	});

	it('derives siblings for .jpg sources', () => {
		const { container } = render(Picture, {
			props: { src: '/images/photo.jpg', alt: 'photo' }
		});
		const sources = container.querySelectorAll('source');
		expect(sources[0].getAttribute('srcset')).toBe('/images/photo.avif');
		expect(sources[1].getAttribute('srcset')).toBe('/images/photo.webp');
	});

	it('derives siblings for .jpeg sources', () => {
		const { container } = render(Picture, {
			props: { src: '/images/photo.jpeg', alt: 'photo' }
		});
		const sources = container.querySelectorAll('source');
		expect(sources[0].getAttribute('srcset')).toBe('/images/photo.avif');
		expect(sources[1].getAttribute('srcset')).toBe('/images/photo.webp');
	});

	it('defaults loading=lazy and decoding=async', () => {
		const { container } = render(Picture, {
			props: { src: '/images/x.png', alt: 'x' }
		});
		const img = container.querySelector('img')!;
		expect(img.getAttribute('loading')).toBe('lazy');
		expect(img.getAttribute('decoding')).toBe('async');
	});

	it('passes loading=eager and fetchpriority=high through', () => {
		const { container } = render(Picture, {
			props: {
				src: '/images/x.png',
				alt: 'x',
				loading: 'eager',
				fetchpriority: 'high'
			}
		});
		const img = container.querySelector('img')!;
		expect(img.getAttribute('loading')).toBe('eager');
		expect(img.getAttribute('fetchpriority')).toBe('high');
	});

	it('forwards width and height attributes', () => {
		const { container } = render(Picture, {
			props: { src: '/images/x.png', alt: 'x', width: 790, height: 748 }
		});
		const img = container.querySelector('img')!;
		expect(img.getAttribute('width')).toBe('790');
		expect(img.getAttribute('height')).toBe('748');
	});

	it('applies custom class to <img>', () => {
		const { container } = render(Picture, {
			props: { src: '/images/x.png', alt: 'x', class: 'hero-crystal' }
		});
		const img = container.querySelector('img')!;
		expect(img.classList.contains('hero-crystal')).toBe(true);
	});
});
