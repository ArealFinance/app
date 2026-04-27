import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	stories: [
		// Co-located: stories live next to their component sources.
		'../src/lib/components/**/*.stories.@(js|ts|svelte|mdx)',
		'../src/lib/**/*.stories.@(js|ts|svelte|mdx)'
	],
	addons: [
		'@storybook/addon-svelte-csf',
		'@storybook/addon-designs', // embed Figma frames in stories
		'@storybook/addon-a11y',
		'@storybook/addon-docs',
		'@storybook/addon-vitest'
	],
	framework: '@storybook/sveltekit',
	staticDirs: ['../static']
};

export default config;
