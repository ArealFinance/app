<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from './Button.svelte';
	import { figmaDesign } from '$lib/figma';

	const { Story } = defineMeta({
		title: 'Primitives/Button',
		component: Button,
		tags: ['autodocs'],
		parameters: {
			layout: 'centered',
			design: figmaDesign('btnGoHome'),
			docs: {
				description: {
					component:
						'Primary clickable primitive. Renders as `<button>` or `<a>` via `href`. Variants: primary (filled purple), outline (transparent + border), inverse (white). Sizes: `md` (default 48px) and `icon` (48×48). Optional `full`, `iconLeft`, `iconRight`.'
				}
			}
		},
		argTypes: {
			variant: {
				control: 'select',
				options: ['primary', 'outline', 'inverse']
			},
			size: {
				control: 'select',
				options: ['md', 'icon']
			},
			disabled: { control: 'boolean' },
			full: { control: 'boolean' },
			href: { control: 'text' }
		},
		args: {
			variant: 'outline',
			size: 'md',
			disabled: false,
			full: false
		}
	});
</script>

<Story name="Primary" args={{ variant: 'primary' }}>
	<Button variant="primary">Primary</Button>
</Story>

<Story name="Outline">
	<Button variant="outline">Outline</Button>
</Story>

<Story name="Inverse">
	<Button variant="inverse">Inverse</Button>
</Story>

<Story name="Variants">
	<div style="display: flex; gap: 12px; flex-wrap: wrap;">
		<Button variant="primary">Primary</Button>
		<Button variant="outline">Outline</Button>
		<Button variant="inverse">Inverse</Button>
	</div>
</Story>

<Story name="Disabled">
	<div style="display: flex; gap: 12px; flex-wrap: wrap;">
		<Button variant="primary" disabled>Primary</Button>
		<Button variant="outline" disabled>Outline</Button>
		<Button variant="inverse" disabled>Inverse</Button>
	</div>
</Story>

<Story name="IconSize">
	<div style="display: flex; gap: 12px;">
		<Button variant="primary" size="icon" aria-label="Send">→</Button>
		<Button variant="outline" size="icon" aria-label="Up">↑</Button>
		<Button variant="inverse" size="icon" aria-label="Plus">+</Button>
	</div>
</Story>

<Story name="WithSlots">
	<Button variant="outline">
		{#snippet iconLeft()}
			<span
				style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:var(--color-purple-900);"
			></span>
		{/snippet}
		41LU…PP5K
		{#snippet iconRight()}<span style="opacity:.7;">↗</span>{/snippet}
	</Button>
</Story>

<Story name="FullWidth">
	<div style="display: flex; flex-direction: column; gap: 12px; min-width: 320px;">
		<Button variant="primary" full>Full primary</Button>
		<Button variant="outline" full>Full outline</Button>
		<Button variant="inverse" full>Full inverse</Button>
	</div>
</Story>

<Story name="AsLink">
	<Button href="/" variant="outline">Home</Button>
</Story>
