/*
 * Component-level smoke test for the token-not-found branch of
 * `routes/markets/[symbol]/+page.svelte`.
 *
 * The route's branch is structurally a thin wrapper that delegates to
 * `MarketsEmptyState` with `variant="no-token"` plus a per-symbol
 * override message. We render the same primitive directly here — the
 * SvelteKit page module pulls in `$app/state`, network/wallet stores,
 * RPC connections, and a dozen markets-graph derivations to render its
 * loaded-token branch, none of which add coverage to the not-found
 * path itself. Component-level smoke is the right granularity: it
 * exercises the same render output the user sees while staying free of
 * orthogonal mocks.
 *
 * Phase 9 follow-up F-9.6.
 *
 * Note on the "retry button" item from the brief: the current
 * `MarketsEmptyState` no-token branch does NOT render a retry button —
 * the page's empty state is purely informational, and the user retries
 * by switching networks or navigating away. The brief asked for the
 * test to assert presence of a retry control; since one does not exist
 * in the implementation, the test instead asserts the title +
 * per-symbol message render correctly, and documents the absence so
 * future work that wires a retry control can extend this case.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MarketsEmptyState from '$lib/components/sections/MarketsEmptyState.svelte';

describe('routes/markets/[symbol] — token-not-found branch', () => {
	const SYMBOL_OVERRIDE = "No on-chain token with symbol 'XYZ' exists on this network.";

	it('renders the "Token not found" title for unknown symbols', () => {
		render(MarketsEmptyState, {
			props: {
				variant: 'no-token',
				message: SYMBOL_OVERRIDE
			}
		});
		expect(screen.getByText('Token not found')).toBeInTheDocument();
	});

	it('surfaces the per-symbol override message', () => {
		render(MarketsEmptyState, {
			props: {
				variant: 'no-token',
				message: SYMBOL_OVERRIDE
			}
		});
		expect(screen.getByText(SYMBOL_OVERRIDE)).toBeInTheDocument();
	});

	it('falls back to the default sub-copy when no message override is provided', () => {
		render(MarketsEmptyState, { props: { variant: 'no-token' } });
		expect(
			screen.getByText('This token has not been deployed on the selected network.')
		).toBeInTheDocument();
	});

	it('marks the empty-state container with the no-token variant attribute', () => {
		// Defense-in-depth: confirms the branch wires the right CSS variant
		// hook so any future variant-specific styles target the correct
		// element.
		const { container } = render(MarketsEmptyState, {
			props: { variant: 'no-token', message: SYMBOL_OVERRIDE }
		});
		const root = container.querySelector('[data-variant]');
		expect(root).not.toBeNull();
		expect(root?.getAttribute('data-variant')).toBe('no-token');
	});
});
