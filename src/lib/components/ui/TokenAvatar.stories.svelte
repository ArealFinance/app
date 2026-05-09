<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TokenAvatar from './TokenAvatar.svelte';
	import type { TokenAvatarTone } from './TokenAvatar.svelte';

	const tones: TokenAvatarTone[] = [
		'purple',
		'blue',
		'teal',
		'magenta',
		'orange',
		'green',
		'red',
		'neutral'
	];

	const { Story } = defineMeta({
		title: 'Primitives/TokenAvatar',
		component: TokenAvatar,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			size: { control: 'select', options: ['sm', 'md', 'lg'] },
			tone: { control: 'select', options: tones },
			symbol: { control: 'text' }
		},
		args: { size: 'md', tone: 'purple', symbol: 'A' }
	});
</script>

<Story name="Sizes">
	<div style="display:flex; gap:12px; align-items: center;">
		<TokenAvatar symbol="A" tone="purple" size="sm" />
		<TokenAvatar symbol="A" tone="purple" size="md" />
		<TokenAvatar symbol="A" tone="purple" size="lg" />
	</div>
</Story>

<Story name="Tones">
	<div style="display:flex; gap:12px; flex-wrap: wrap;">
		{#each tones as tone}
			<TokenAvatar symbol={tone[0].toUpperCase()} {tone} />
		{/each}
	</div>
</Story>

<Story name="WithImage">
	<div style="display:flex; gap:12px;">
		<TokenAvatar src="/images/tokens/rwt-mark.svg" alt="RWT" />
		<TokenAvatar src="/images/tokens/rwt-mark.svg" alt="RWT" size="lg" />
	</div>
</Story>
