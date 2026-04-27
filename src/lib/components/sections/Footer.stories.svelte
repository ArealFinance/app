<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Footer from './Footer.svelte';
	import { figmaDesign } from '$lib/figma';

	const { Story } = defineMeta({
		title: 'Sections/Footer',
		component: Footer,
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			design: figmaDesign('footerHomepage')
		}
	});
</script>

<Story name="Default">
	<Footer onSubscribe={(email) => console.log('subscribed:', email)} />
</Story>
