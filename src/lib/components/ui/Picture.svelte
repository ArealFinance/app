<script lang="ts" module>
	export type PictureLoading = 'lazy' | 'eager';
	export type PictureFetchPriority = 'high' | 'low' | 'auto';
</script>

<script lang="ts">
	type Props = {
		/** Path to the source image (.png/.jpg/.jpeg). AVIF/WebP siblings are derived automatically. */
		src: string;
		alt: string;
		width?: number | string;
		height?: number | string;
		loading?: PictureLoading;
		fetchpriority?: PictureFetchPriority;
		decoding?: 'sync' | 'async' | 'auto';
		class?: string;
	};

	let {
		src,
		alt,
		width,
		height,
		loading = 'lazy',
		fetchpriority = 'auto',
		decoding = 'async',
		class: className = ''
	}: Props = $props();

	// Derive AVIF/WebP siblings from the source path.
	// The optimize-images pipeline guarantees these exist for every PNG/JPG under static/images/.
	const avifSrc = $derived(src.replace(/\.(png|jpe?g)$/i, '.avif'));
	const webpSrc = $derived(src.replace(/\.(png|jpe?g)$/i, '.webp'));
</script>

<picture>
	<source srcset={avifSrc} type="image/avif" />
	<source srcset={webpSrc} type="image/webp" />
	<img
		{src}
		{alt}
		{width}
		{height}
		{loading}
		{decoding}
		fetchpriority={fetchpriority}
		class={className}
	/>
</picture>

<style>
	picture {
		display: contents;
	}
</style>
