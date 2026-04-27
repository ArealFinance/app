import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WalletAddressChip from './WalletAddressChip.svelte';

const ADDR = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

describe('WalletAddressChip', () => {
	it('renders truncated address by default (4 chars per side)', () => {
		render(WalletAddressChip, { props: { address: ADDR } });
		expect(screen.getByText('DYw8…NSKK')).toBeInTheDocument();
	});

	it('respects custom truncate length', () => {
		render(WalletAddressChip, { props: { address: ADDR, truncate: 6 } });
		expect(screen.getByText('DYw8jC…CNSKK'.slice(0, 6) + '…' + ADDR.slice(-6))).toBeInTheDocument();
	});

	it('uses full address as aria-label', () => {
		render(WalletAddressChip, { props: { address: ADDR } });
		expect(screen.getByRole('button')).toHaveAttribute('aria-label', `Wallet ${ADDR}`);
	});

	it('respects explicit aria-label', () => {
		render(WalletAddressChip, {
			props: { address: ADDR, 'aria-label': 'Open wallet menu' }
		});
		expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Open wallet menu');
	});

	it('renders as anchor when href is given', () => {
		render(WalletAddressChip, { props: { address: ADDR, href: '/wallet' } });
		expect(screen.getByRole('link')).toHaveAttribute('href', '/wallet');
	});

	it('hides trailing icon when hideIcon=true', () => {
		const { container } = render(WalletAddressChip, {
			props: { address: ADDR, hideIcon: true }
		});
		// Default has ArrowUpRightSmall svg; with hideIcon, no svg should be present except possibly dot
		const svgs = container.querySelectorAll('svg');
		expect(svgs.length).toBe(0);
	});

	it('passes short address through unchanged', () => {
		render(WalletAddressChip, { props: { address: 'short' } });
		expect(screen.getByText('short')).toBeInTheDocument();
	});
});
