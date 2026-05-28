/*
 * Faucet client unit tests.
 *
 * Strategy mirrors `mint.test.ts`: hoist mocks for `apiFetch`, `network`,
 * `userBalances`, and `toast`, then drive each documented response code +
 * exercise single-flight guard for both `claimUsdc` and `claimRwt`.
 *
 * The single-flight guard is now per-kind (USDC and RWT each have their own
 * `inFlight` rune) — covered explicitly so a regression that goes back to a
 * shared flag would be caught.
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

		// Re-import lazily so the singleton's `inFlight` runes reset per test.
		// `vi.resetModules()` evicts the cached module graph including the
		// singleton's internal state.
		vi.resetModules();
		const mod = await import('./faucet.svelte');
		faucet = mod.faucet;
	});

	describe('claimUsdc', () => {
		it('200 happy path: success toast + balance refresh', async () => {
			mocks.apiFetch.mockResolvedValue(
				jsonResponse(200, { signature: 'SIG_FAUCET_OK_1234567890' })
			);

			await faucet.claimUsdc(WALLET);

			expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
			expect(mocks.apiFetch.mock.calls[0]?.[0]).toBe(
				'https://api.example.test/faucet/usdc'
			);
			expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
			const msg = mocks.toastSuccess.mock.calls[0]?.[0] as string;
			expect(msg).toContain('1000 test USDC');
			expect(mocks.balancesRefreshAll).toHaveBeenCalledTimes(1);
			expect(mocks.toastError).not.toHaveBeenCalled();
			expect(mocks.toastInfo).not.toHaveBeenCalled();
		});

		it('429 with retryAfterSec=3600: info toast formatted "1h 0m"', async () => {
			mocks.apiFetch.mockResolvedValue(jsonResponse(429, { retryAfterSec: 3600 }));

			await faucet.claimUsdc(WALLET);

			expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
			const msg = mocks.toastInfo.mock.calls[0]?.[0] as string;
			expect(msg).toContain('1h 0m');
			expect(mocks.balancesRefreshAll).not.toHaveBeenCalled();
		});

		it('429 with retryAfterSec=600: info toast formatted "0h 10m"', async () => {
			mocks.apiFetch.mockResolvedValue(jsonResponse(429, { retryAfterSec: 600 }));

			await faucet.claimUsdc(WALLET);

			expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
			const msg = mocks.toastInfo.mock.calls[0]?.[0] as string;
			expect(msg).toContain('0h 10m');
		});

		it('500 / non-200: error toast', async () => {
			mocks.apiFetch.mockResolvedValue(
				jsonResponse(500, { message: 'Faucet exhausted' })
			);

			await faucet.claimUsdc(WALLET);

			expect(mocks.toastError).toHaveBeenCalledTimes(1);
			const msg = mocks.toastError.mock.calls[0]?.[0] as string;
			expect(msg).toContain('Faucet exhausted');
			expect(mocks.balancesRefreshAll).not.toHaveBeenCalled();
		});

		it('single-flight: second claim while in-flight is a no-op', async () => {
			let resolveFirst!: (value: Response) => void;
			const pending = new Promise<Response>((resolve) => {
				resolveFirst = resolve;
			});
			mocks.apiFetch.mockReturnValueOnce(pending);

			const p1 = faucet.claimUsdc(WALLET);
			const p2 = faucet.claimUsdc(WALLET);

			expect(faucet.state.usdcInFlight).toBe(true);
			expect(mocks.apiFetch).toHaveBeenCalledTimes(1);

			resolveFirst(jsonResponse(200, { signature: 'SIG_OK' }));
			await Promise.all([p1, p2]);

			expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
			expect(faucet.state.usdcInFlight).toBe(false);
		});
	});

	describe('claimRwt', () => {
		it('200 happy path: success toast + balance refresh', async () => {
			mocks.apiFetch.mockResolvedValue(
				jsonResponse(200, {
					signature: 'SIG_FAUCET_RWT_OK_9876543210',
					ata: '8vhQ4KJDVNtgXc3dSgtKW8v6vrYCddffWypJ3YSA2dpy',
					amount: 100
				})
			);

			await faucet.claimRwt(WALLET);

			expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
			expect(mocks.apiFetch.mock.calls[0]?.[0]).toBe(
				'https://api.example.test/faucet/rwt'
			);
			expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
			const msg = mocks.toastSuccess.mock.calls[0]?.[0] as string;
			expect(msg).toContain('100 test RWT');
			expect(mocks.balancesRefreshAll).toHaveBeenCalledTimes(1);
			expect(mocks.toastError).not.toHaveBeenCalled();
			expect(mocks.toastInfo).not.toHaveBeenCalled();
		});

		it('429: cooldown info toast', async () => {
			mocks.apiFetch.mockResolvedValue(
				jsonResponse(429, { retryAfterSec: 86396 })
			);

			await faucet.claimRwt(WALLET);

			expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
			const msg = mocks.toastInfo.mock.calls[0]?.[0] as string;
			// 86396 → 23h 60m (rounds up from 59.93m) — we just want format presence.
			expect(msg).toMatch(/\d+h \d+m/);
			expect(mocks.balancesRefreshAll).not.toHaveBeenCalled();
		});

		it('404 (mainnet endpoint not available): error toast', async () => {
			mocks.apiFetch.mockResolvedValue(
				jsonResponse(404, { message: 'Not Found' })
			);

			await faucet.claimRwt(WALLET);

			expect(mocks.toastError).toHaveBeenCalledTimes(1);
			const msg = mocks.toastError.mock.calls[0]?.[0] as string;
			expect(msg).toContain('Not Found');
			expect(mocks.balancesRefreshAll).not.toHaveBeenCalled();
		});

		it('single-flight: second RWT claim while in-flight is a no-op', async () => {
			let resolveFirst!: (value: Response) => void;
			const pending = new Promise<Response>((resolve) => {
				resolveFirst = resolve;
			});
			mocks.apiFetch.mockReturnValueOnce(pending);

			const p1 = faucet.claimRwt(WALLET);
			const p2 = faucet.claimRwt(WALLET);

			expect(faucet.state.rwtInFlight).toBe(true);
			expect(mocks.apiFetch).toHaveBeenCalledTimes(1);

			resolveFirst(jsonResponse(200, { signature: 'SIG_OK' }));
			await Promise.all([p1, p2]);

			expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
			expect(faucet.state.rwtInFlight).toBe(false);
		});
	});

	describe('per-kind single-flight isolation', () => {
		it('USDC claim in-flight does NOT block an RWT claim', async () => {
			// First call (USDC) hangs.
			let resolveUsdc!: (value: Response) => void;
			const usdcPending = new Promise<Response>((resolve) => {
				resolveUsdc = resolve;
			});
			mocks.apiFetch.mockReturnValueOnce(usdcPending);

			// Second call (RWT) resolves immediately with 200.
			mocks.apiFetch.mockResolvedValueOnce(
				jsonResponse(200, { signature: 'SIG_RWT_OK' })
			);

			const usdcPromise = faucet.claimUsdc(WALLET);
			const rwtPromise = faucet.claimRwt(WALLET);

			// The RWT call should resolve while USDC is still in-flight.
			await rwtPromise;
			expect(faucet.state.usdcInFlight).toBe(true);
			expect(faucet.state.rwtInFlight).toBe(false);
			expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
			// RWT success message landed even though USDC is still pending.
			expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
			expect(mocks.toastSuccess.mock.calls[0]?.[0]).toContain('RWT');

			resolveUsdc(jsonResponse(200, { signature: 'SIG_USDC_OK' }));
			await usdcPromise;
			expect(faucet.state.usdcInFlight).toBe(false);
			expect(mocks.toastSuccess).toHaveBeenCalledTimes(2);
		});
	});
});
