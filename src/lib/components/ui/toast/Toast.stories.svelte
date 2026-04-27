<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Button from '../Button.svelte';
	import Toaster from './Toaster.svelte';
	import { toast } from './toast-store';

	const { Story } = defineMeta({
		title: 'Primitives/Toast',
		tags: ['autodocs'],
		parameters: {
			layout: 'centered',
			docs: {
				description: {
					component:
						'Global toast queue. Mount `<Toaster />` once in root layout. Trigger via `toast.success(msg, opts?)`. Tones: success / error / warning / info. Default duration 4000ms; 0 = sticky.'
				}
			}
		}
	});
</script>

<Story name="Tones">
	<Toaster />
	<div style="display:flex; gap: 12px; flex-wrap: wrap;">
		<Button variant="primary" onclick={() => toast.success('Stake successful')}>Success</Button>
		<Button variant="outline" onclick={() => toast.error('Network error — please retry')}>
			Error
		</Button>
		<Button variant="outline" onclick={() => toast.warning('Approaching slippage limit')}>
			Warning
		</Button>
		<Button variant="outline" onclick={() => toast.info('New version available')}>Info</Button>
	</div>
</Story>

<Story name="WithTitle">
	<Toaster />
	<div style="display:flex; gap: 12px; flex-wrap: wrap;">
		<Button
			variant="primary"
			onclick={() =>
				toast.success('Your stake has been confirmed on-chain.', {
					title: 'Transaction sent',
					duration: 6000
				})}
		>
			Titled (6s)
		</Button>
		<Button
			variant="outline"
			onclick={() =>
				toast.error('No route found for RWTD → USDYD. Try a different pair or amount.', {
					title: 'Swap failed',
					duration: 8000
				})}
		>
			Long error (8s)
		</Button>
	</div>
</Story>

<Story name="Sticky">
	<Toaster />
	<Button
		variant="outline"
		onclick={() =>
			toast.warning('Action required — review your position before continuing.', {
				title: 'Demo mode',
				duration: 0
			})}
	>
		Sticky warning
	</Button>
</Story>

<Story name="Stack">
	<Toaster />
	<div style="display:flex; gap:12px;">
		<Button
			variant="primary"
			onclick={() => {
				toast.success('First');
				setTimeout(() => toast.info('Second'), 200);
				setTimeout(() => toast.warning('Third'), 400);
			}}
		>
			Fire 3 in a row
		</Button>
		<Button variant="outline" onclick={() => toast.clear()}>Clear all</Button>
	</div>
</Story>
