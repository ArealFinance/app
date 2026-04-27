<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import IconButton from './IconButton.svelte';
	import {
		Gear,
		Clipboard,
		SendAlt,
		AngleUpSmall,
		ArrowUpSmall,
		ArrowLeftSmall,
		ArrowRightSmall,
		ArrowUpRightSmall,
		Plus,
		Xmark,
		House
	} from '$lib/icons';

	const { Story } = defineMeta({
		title: 'Primitives/IconButton',
		component: IconButton,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			variant: { control: 'select', options: ['ghost', 'subtle', 'solid', 'inset'] },
			size: { control: 'select', options: ['sm', 'md', 'lg'] },
			disabled: { control: 'boolean' },
			href: { control: 'text' }
		},
		args: { variant: 'ghost', size: 'md', disabled: false }
	});
</script>

<Story name="Variants">
	<div style="display:flex; gap: 12px;">
		<IconButton variant="ghost" aria-label="Settings"><Gear size={18} /></IconButton>
		<IconButton variant="subtle" aria-label="Copy"><Clipboard size={18} /></IconButton>
		<IconButton variant="solid" aria-label="Send"><SendAlt size={18} /></IconButton>
		<IconButton variant="inset" aria-label="Up"><AngleUpSmall size={18} /></IconButton>
	</div>
</Story>

<Story name="Sizes">
	<div style="display:flex; gap: 12px; align-items: center;">
		<IconButton variant="inset" size="sm" aria-label="Up"><ArrowUpSmall size={14} /></IconButton>
		<IconButton variant="inset" size="md" aria-label="Up"><ArrowUpSmall size={18} /></IconButton>
		<IconButton variant="inset" size="lg" aria-label="Up"><ArrowUpSmall size={22} /></IconButton>
	</div>
</Story>

<Story name="Disabled">
	<div style="display:flex; gap: 12px;">
		<IconButton variant="ghost" disabled aria-label="Disabled"><Xmark size={18} /></IconButton>
		<IconButton variant="solid" disabled aria-label="Disabled"><Xmark size={18} /></IconButton>
		<IconButton variant="inset" disabled aria-label="Disabled"><Xmark size={18} /></IconButton>
	</div>
</Story>

<Story name="AsLink">
	<div style="display:flex; gap: 12px;">
		<IconButton variant="ghost" href="/" aria-label="Home"><House size={18} /></IconButton>
		<IconButton variant="inset" href="#card" aria-label="Forward">
			<ArrowUpRightSmall size={18} />
		</IconButton>
	</div>
</Story>

<Story name="Toolbar">
	<div
		style="display:inline-flex; align-items:center; gap:8px; padding: 8px 12px; border:1px solid var(--color-border); border-radius:12px; color:var(--color-text-muted);"
	>
		<IconButton variant="ghost" size="sm" aria-label="Back"><ArrowLeftSmall size={14} /></IconButton>
		<IconButton variant="ghost" size="sm" aria-label="Settings"><Gear size={14} /></IconButton>
		<IconButton variant="ghost" size="sm" aria-label="Copy"><Clipboard size={14} /></IconButton>
		<IconButton variant="ghost" size="sm" aria-label="Add"><Plus size={14} /></IconButton>
		<IconButton variant="ghost" size="sm" aria-label="Forward">
			<ArrowRightSmall size={14} />
		</IconButton>
	</div>
</Story>

<Story name="IconVariants">
	<div style="display:flex; gap: 12px;">
		<IconButton variant="ghost" aria-label="Light"><Gear size={18} variant="light" /></IconButton>
		<IconButton variant="ghost" aria-label="Regular"
			><Gear size={18} variant="regular" /></IconButton
		>
		<IconButton variant="ghost" aria-label="Filled"><Gear size={18} variant="filled" /></IconButton>
		<IconButton variant="ghost" aria-label="Duotone"
			><Gear size={18} variant="duotone" /></IconButton
		>
		<IconButton variant="ghost" aria-label="Duotone Line">
			<Gear size={18} variant="duotone-line" />
		</IconButton>
	</div>
</Story>
