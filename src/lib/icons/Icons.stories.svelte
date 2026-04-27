<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import * as icons from '$lib/icons';

	const allIcons = Object.entries(icons);
	const variants = ['light', 'regular', 'filled', 'duotone', 'duotone-line'] as const;
	const ChartPieSimple = icons.ChartPieSimple;

	const { Story } = defineMeta({
		title: 'Foundations/Icons',
		tags: ['autodocs'],
		parameters: {
			layout: 'fullscreen',
			docs: {
				description: {
					component:
						'Icon set generated from `@zappicon/react` (MIT) by `scripts/generate-icons.mjs`. 24 curated icons × 5 stylistic variants. Default = `regular`. Color via `currentColor`.'
				}
			}
		}
	});
</script>

<Story name="All">
	<div
		style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;padding:24px;color:var(--color-text);"
	>
		{#each allIcons as [name, Component]}
			<div
				style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-bg);min-width:90px;"
			>
				<div style="display:flex;align-items:center;justify-content:center;min-height:32px;">
					<Component size={24} />
				</div>
				<code style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);">
					{name}
				</code>
			</div>
		{/each}
	</div>
</Story>

<Story name="Variants">
	<div style="display:flex;gap:24px;padding:24px;flex-wrap:wrap;color:var(--color-text);">
		{#each variants as v}
			<div
				style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-bg);min-width:90px;"
			>
				<div style="display:flex;align-items:center;justify-content:center;min-height:40px;">
					<ChartPieSimple size={32} variant={v} />
				</div>
				<code style="font-size:10px;color:var(--color-text-muted);font-family:var(--font-mono);">
					{v}
				</code>
			</div>
		{/each}
	</div>
</Story>
