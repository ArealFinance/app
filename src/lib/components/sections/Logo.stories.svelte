<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Logo from './Logo.svelte';

	const { Story } = defineMeta({
		title: 'Sections/Logo',
		component: Logo,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			height: { control: 'number' },
			hideWordmark: { control: 'boolean' }
		},
		args: { height: 32, hideWordmark: false }
	});
</script>

<Story name="Default">
	<Logo />
</Story>

<Story name="MarkOnly">
	<Logo hideWordmark />
</Story>

<Story name="Sizes">
	<div style="display:flex; gap:24px; align-items: center;">
		<Logo height={24} />
		<Logo height={32} />
		<Logo height={48} />
		<Logo height={64} />
	</div>
</Story>
