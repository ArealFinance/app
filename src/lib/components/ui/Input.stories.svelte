<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Input from './Input.svelte';
	import IconButton from './IconButton.svelte';
	import Card from './Card.svelte';
	import { SendAlt } from '$lib/icons';

	const { Story } = defineMeta({
		title: 'Primitives/Input',
		component: Input,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		argTypes: {
			variant: { control: 'select', options: ['default', 'ghost'] },
			size: { control: 'select', options: ['md', 'lg'] },
			error: { control: 'boolean' },
			disabled: { control: 'boolean' },
			placeholder: { control: 'text' },
			value: { control: 'text' }
		},
		args: {
			variant: 'default',
			size: 'md',
			placeholder: 'Type something…',
			value: '',
			error: false,
			disabled: false
		}
	});
</script>

<Story name="Default">
	<div style="min-width: 360px;">
		<Input placeholder="Type something…" />
	</div>
</Story>

<Story name="Sizes">
	<div style="display: flex; flex-direction: column; gap: 12px; min-width: 360px;">
		<Input placeholder="Size md (48px)" size="md" />
		<Input placeholder="Size lg (56px)" size="lg" />
	</div>
</Story>

<Story name="WithSuffix">
	<div style="min-width: 360px;">
		<Input value="1000" placeholder="0.00" inputmode="numeric">
			{#snippet suffix()}<span>USDT</span>{/snippet}
		</Input>
	</div>
</Story>

<Story name="ErrorState">
	<div style="min-width: 360px;">
		<Input placeholder="Insufficient balance…" error />
	</div>
</Story>

<Story name="Disabled">
	<div style="min-width: 360px;">
		<Input value="locked value" disabled />
	</div>
</Story>

<Story name="Subscribe">
	<Card variant="muted" padding="sm">
		<div style="display:flex; gap:12px; align-items: stretch; min-width: 480px;">
			<div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
				<div
					style="font-size:11px;color:var(--color-text-muted);padding:0 20px;margin-bottom:-4px;"
				>
					Contact Us
				</div>
				<Input type="email" placeholder="Your Email address" variant="ghost" size="lg" />
			</div>
			<IconButton variant="solid" size="lg" aria-label="Send"><SendAlt size={20} /></IconButton>
		</div>
	</Card>
</Story>
