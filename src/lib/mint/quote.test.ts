/*
 * Mint quote store unit tests.
 *
 * Coverage targets (per Phase 10 plan):
 *   MQ-1. 200ms debounce — multiple rapid setInput collapse to one recompute
 *   MQ-2. recompute() — explicit page-driven recompute against current vault
 *         (bypass debounce; the page calls this on vault/network change)
 *   MQ-3. setSlippage does NOT recompute the quote
 *   MQ-4. setSlippage clamps to shared [SLIPPAGE_MIN_BPS, SLIPPAGE_MAX_BPS]
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const RWT_MINT = new PublicKey('1111111111111111111111111111111A');

const FAKE_VAULT = {
	totalInvestedCapital: 1_000_000n,
	totalRwtSupply: 1_000_000n,
	mintPaused: false,
	navBookValue: 1_000_000n,
	capitalAccumulatorAta: RWT_MINT,
	rwtMint: RWT_MINT,
	authority: RWT_MINT,
	pendingAuthority: RWT_MINT,
	hasPending: false,
	manager: RWT_MINT,
	pauseAuthority: RWT_MINT,
	arealFeeDestination: RWT_MINT,
	bump: 0
};

const FAKE_VAULT_NEW_NAV = {
	...FAKE_VAULT,
	totalInvestedCapital: 2_000_000n,
	totalRwtSupply: 1_000_000n
};

const mocks = vi.hoisted(() => ({
	quoteMintRwt: vi.fn(),
	currentVault: null as unknown
}));

vi.mock('@areal/sdk/rwt-engine', () => ({
	quoteMintRwt: mocks.quoteMintRwt
}));

vi.mock('@areal/sdk/network', () => ({
	RWT_MINTS: {
		localnet: RWT_MINT,
		devnet: RWT_MINT,
		mainnet: RWT_MINT
	}
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return 'devnet';
		}
	}
}));

vi.mock('./vault.svelte', () => ({
	vaultStore: {
		get vault() {
			return mocks.currentVault;
		}
	}
}));

async function settle(times = 4) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('mint quote store', () => {
	let mintQuote: typeof import('./quote.svelte').mintQuote;

	beforeEach(async () => {
		vi.useFakeTimers();
		Object.values(mocks).forEach((m) => {
			if (m !== null && typeof (m as { mockReset?: () => void }).mockReset === 'function') {
				(m as { mockReset: () => void }).mockReset();
			}
		});
		mocks.currentVault = FAKE_VAULT;
		mocks.quoteMintRwt.mockReturnValue({
			ok: true,
			quote: {
				rwtOut: 1_000_000n,
				netDeposit: 990_000n,
				fees: { feeTotal: 10_000n, feeDao: 5_000n, feeVault: 5_000n, netDeposit: 990_000n },
				navAtQuote: 1_000_000n,
				capitalAfter: 1_990_000n,
				supplyAfter: 1_990_000n,
				navAfter: 1_000_000n
			}
		});

		const mod = await import('./quote.svelte');
		mintQuote = mod.mintQuote;
		// Reset module-level state between tests by zeroing the input.
		// We cannot fully tear down the singleton, but the module-level
		// $effect will pick up the new vault mock.
		mintQuote.setInput(0n);
		await vi.advanceTimersByTimeAsync(250);
		mocks.quoteMintRwt.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('MQ-1 200ms debounce: rapid setInput collapses to one recompute', async () => {
		mintQuote.setInput(100n);
		mintQuote.setInput(200n);
		mintQuote.setInput(300n);

		// Before the debounce expires: no recompute has run.
		await vi.advanceTimersByTimeAsync(100);
		expect(mocks.quoteMintRwt).not.toHaveBeenCalled();

		// After debounce: exactly one recompute, with the LAST value.
		await vi.advanceTimersByTimeAsync(200);
		expect(mocks.quoteMintRwt).toHaveBeenCalledTimes(1);
		expect(mocks.quoteMintRwt).toHaveBeenLastCalledWith(
			expect.objectContaining({ amountIn: 300n })
		);
	});

	it('MQ-2 recompute(): bypasses debounce, prices against current vault', async () => {
		// Set an input so the recompute has something to compute.
		mintQuote.setInput(500_000n);
		await vi.advanceTimersByTimeAsync(200);
		mocks.quoteMintRwt.mockClear();

		// Simulate the vault store mutating to a new snapshot (WS push).
		// The page's $effect picks up the change and forwards via recompute().
		mocks.currentVault = FAKE_VAULT_NEW_NAV;
		mintQuote.recompute();

		// Synchronous recompute against the *new* vault, no debounce wait.
		expect(mocks.quoteMintRwt).toHaveBeenCalledTimes(1);
		expect(mocks.quoteMintRwt).toHaveBeenLastCalledWith(
			expect.objectContaining({
				vault: FAKE_VAULT_NEW_NAV,
				amountIn: 500_000n
			})
		);
	});

	it('MQ-3 setSlippage does NOT recompute the quote', async () => {
		mintQuote.setInput(500_000n);
		await vi.advanceTimersByTimeAsync(200);
		mocks.quoteMintRwt.mockClear();

		mintQuote.setSlippage(100);
		mintQuote.setSlippage(50);
		mintQuote.setSlippage(10);

		// Even after the debounce window — no recompute.
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.quoteMintRwt).not.toHaveBeenCalled();
		// But the public slippage state DID update.
		expect(mintQuote.slippageBps).toBe(10);
	});

	it('MQ-4: setSlippage clamps to [10, 500] bounds', () => {
		// Below the floor — clamped up to the shared minimum.
		mintQuote.setSlippage(0);
		expect(mintQuote.slippageBps).toBe(10);

		// Above the ceiling — clamped down to the shared maximum.
		mintQuote.setSlippage(10000);
		expect(mintQuote.slippageBps).toBe(500);

		// Inside the window — passes through untouched.
		mintQuote.setSlippage(50);
		expect(mintQuote.slippageBps).toBe(50);
	});
});
