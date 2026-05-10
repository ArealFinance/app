/*
 * Faucet client unit tests.
 *
 * Strategy mirrors `mint.test.ts`: hoist mocks for `apiFetch`, `network`,
 * `userBalances`, and `toast`, then drive each documented response code +
 * exercise single-flight guard.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	apiFetch: vi.fn(),
	balancesRefreshAll: vi.fn(),
	toastSuccess: vi.fn(),
	toastInfo: vi.fn(),
	toastError: vi.fn()
}));

vi.mock('$lib/sdk/api-fetch', () => ({
	apiFetch: mocks.apiFetch
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get endpoint() {
			return { backendApiUrl: 'https://api.example.test' };
		}
	}
}));

vi.mock('$lib/swap/balances.svelte', () => ({
	userBalances: {
		refreshAll: mocks.balancesRefreshAll
	}
}));

vi.mock('$lib/components/ui', () => ({
	toast: {
		success: mocks.toastSuccess,
		info: mocks.toastInfo,
		error: mocks.toastError
	}
}));

const WALLET = 'CHK4qmvZJ31uxFNdGWf2W3iDjyiyfYbyPxEDmqZNRjne';

function jsonResponse(status: number, body: unknown): Response {
	return {
		status,
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

describe('faucet client', () => {
	let faucet: typeof import('./faucet.svelte').faucet;

	beforeEach(async () => {
		Object.values(mocks).forEach((m) => {
			(m as { mockReset: () => void }).mockReset();
		});
		mocks.balancesRefreshAll.mockResolvedValue(undefined);

		// Re-import lazily so the singleton's `inFlight` rune resets per test.
		// `vi.resetModules()` evicts the cached module graph including the
		// singleton's internal state.
		vi.resetModules();
		const mod = await import('./faucet.svelte');
		faucet = mod.faucet;
	});

	it('200 happy path: success toast + balance refresh', async () => {
		mocks.apiFetch.mockResolvedValue(
			jsonResponse(200, { signature: 'SIG_FAUCET_OK_1234567890' })
		);

		await faucet.claim(WALLET);

		expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
		expect(mocks.balancesRefreshAll).toHaveBeenCalledTimes(1);
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.toastInfo).not.toHaveBeenCalled();
	});

	it('429 with retryAfterSec=3600: info toast formatted "1h 0m"', async () => {
		mocks.apiFetch.mockResolvedValue(jsonResponse(429, { retryAfterSec: 3600 }));

		await faucet.claim(WALLET);

		expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
		const msg = mocks.toastInfo.mock.calls[0]?.[0] as string;
		expect(msg).toContain('1h 0m');
		expect(mocks.balancesRefreshAll).not.toHaveBeenCalled();
	});

	it('429 with retryAfterSec=600: info toast formatted "0h 10m"', async () => {
		mocks.apiFetch.mockResolvedValue(jsonResponse(429, { retryAfterSec: 600 }));

		await faucet.claim(WALLET);

		expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
		const msg = mocks.toastInfo.mock.calls[0]?.[0] as string;
		expect(msg).toContain('0h 10m');
	});

	it('500 / non-200: error toast', async () => {
		mocks.apiFetch.mockResolvedValue(
			jsonResponse(500, { message: 'Faucet exhausted' })
		);

		await faucet.claim(WALLET);

		expect(mocks.toastError).toHaveBeenCalledTimes(1);
		const msg = mocks.toastError.mock.calls[0]?.[0] as string;
		expect(msg).toContain('Faucet exhausted');
		expect(mocks.balancesRefreshAll).not.toHaveBeenCalled();
	});

	it('single-flight: second claim while in-flight is a no-op', async () => {
		// Resolve the first call lazily so we can fire a second `claim` while
		// the first promise is still pending.
		let resolveFirst!: (value: Response) => void;
		const pending = new Promise<Response>((resolve) => {
			resolveFirst = resolve;
		});
		mocks.apiFetch.mockReturnValueOnce(pending);

		const p1 = faucet.claim(WALLET);
		// Second call lands while inFlight is true — should drop without firing.
		const p2 = faucet.claim(WALLET);

		expect(faucet.state.inFlight).toBe(true);
		expect(mocks.apiFetch).toHaveBeenCalledTimes(1);

		resolveFirst(jsonResponse(200, { signature: 'SIG_OK' }));
		await Promise.all([p1, p2]);

		expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
		expect(faucet.state.inFlight).toBe(false);
	});
});
