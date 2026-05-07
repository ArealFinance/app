<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import MasterPoolGuard from './MasterPoolGuard.svelte';

	const { Story } = defineMeta({
		title: 'Sections/MasterPoolGuard',
		component: MasterPoolGuard,
		tags: ['autodocs'],
		parameters: { layout: 'centered' },
		args: { symbolA: 'RWT', symbolB: 'USDC' }
	});
</script>

<Story name="UsdcRwt">
	<MasterPoolGuard symbolA="RWT" symbolB="USDC" />
</Story>

<Story name="UsdyRwt">
	<MasterPoolGuard symbolA="RWT" symbolB="USDY" />
</Story>
