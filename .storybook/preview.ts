import type { Preview } from '@storybook/sveltekit';
import '../src/lib/styles/global.css';

const preview: Preview = {
	parameters: {
		layout: 'centered',
		backgrounds: {
			default: 'page',
			values: [
				{ name: 'page', value: '#070c1c' }, // --color-bg
				{ name: 'surface', value: '#080a0f' }, // --color-surface
				{ name: 'inset', value: '#181a29' }, // --color-surface-inset
				{ name: 'white', value: '#fbf2ff' } // --color-white-900
			]
		},
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		},
		options: {
			storySort: {
				order: [
					'Foundations',
					['Tokens', 'Icons'],
					'Primitives',
					[
						'Button',
						'IconButton',
						'Card',
						'StatusPill',
						'Input',
						'WalletAddressChip',
						'TokenAvatar',
						'StatCard',
						'TokenRow',
						'EmptyState',
						'Toast',
						'Chart'
					],
					'Sections',
					[
						'Logo',
						'Header',
						'Footer',
						'AppShell',
						'DemoBanner',
						'TokenList',
						'TabBar',
						'TokenStatCard'
					]
				]
			}
		},
		a11y: {
			test: 'todo'
		}
	}
};

export default preview;
