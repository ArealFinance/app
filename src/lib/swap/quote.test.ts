/*
 * Quote store unit tests.
 *
 * Coverage targets (per Phase 8 plan):
 *   FQ-1. 200ms debounce — multiple rapid setInput collapse to one recompute
 *   FQ-2. WS pool update triggers recompute
 *   FQ-3. Switch pool tears down old subscription on the SAME Connection
 *         it was registered on (capture-instance pattern)
 *   FQ-4. Slippage change → does NOT recompute the quote
 *   FQ-5. setSlippage clamps to shared [10, 500] bps bounds
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const POOL_PDA_A = new PublicKey('11111111111111111111111111111114');
const POOL_PDA_B = new PublicKey('1111111111111111111111111111111B');
const DEX_CONFIG_PDA = new PublicKey('11111111111111111111111111111115');
const USDC_MINT = new PublicKey('11111111111111111111111111111119');
const RWT_MINT = new PublicKey('1111111111111111111111111111111A');

const mocks = vi.hoisted(() => ({
	parsePoolState: vi.fn(),
	parseDexConfig: vi.fn(),
	quoteSwap: vi.fn(),
	getAccountInfo: vi.fn(),
	connectionA: {
		onAccountChange: vi.fn(),
		removeAccountChangeListener: vi.fn()
	},
	connectionB: {
		onAccountChange: vi.fn(),
		removeAccountChangeListener: vi.fn()
	},
	wsConnSeq: 0,
	currentNetwork: 'devnet'
}));

vi.mock('@areal/sdk/native-dex', () => ({
	parsePoolState: mocks.parsePoolState,
	parseDexConfig: mocks.parseDexConfig,
	quoteSwap: mocks.quoteSwap
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
			return mocks.currentNetwork;
		},
		get connection() {
			return {
				getAccountInfo: mocks.getAccountInfo
			};
		},
		get wsConnection() {
			// First subscribe gets connectionA, second cycle gets connectionB.
			// We bump a sequence counter and switch on parity so the test can
			// verify the SAME Connection instance handles unsubscribe.
			mocks.wsConnSeq++;
			return mocks.wsConnSeq <= 1 ? mocks.connectionA : mocks.connectionB;
		}
	}
}));

function makeEntry(poolPda: PublicKey) {
	return {
		label: 'USDC / RWT',
		mintA: USDC_MINT,
		mintB: RWT_MINT,
		symbolA: 'USDC',
		symbolB: 'RWT',
		decimalsA: 6,
		decimalsB: 6,
		poolPda,
		dexConfigPda: DEX_CONFIG_PDA
	};
}

const FAKE_POOL = {
	tokenAMint: USDC_MINT,
	tokenBMint: RWT_MINT,
	vaultA: USDC_MINT,
	vaultB: RWT_MINT,
	hasOtTreasury: false
};
const FAKE_CONFIG = { arealFeeDestination: USDC_MINT };

const fakePoolInfo = { data: new Uint8Array([1]), executable: false, lamports: 0, owner: USDC_MINT };
const fakeConfigInfo = { data: new Uint8Array([2]), executable: false, lamports: 0, owner: USDC_MINT };

async function settle(times = 4) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('quote store', () => {
	let quote: typeof import('./quote.svelte').quote;

	beforeEach(async () => {
		vi.useFakeTimers();
		Object.values(mocks).forEach((m) => {
			if (typeof (m as { mockReset?: () => void }).mockReset === 'function') {
				(m as { mockReset: () => void }).mockReset();
			}
		});
		mocks.connectionA.onAccountChange.mockReset();
		mocks.connectionA.removeAccountChangeListener.mockReset();
		mocks.connectionB.onAccountChange.mockReset();
		mocks.connectionB.removeAccountChangeListener.mockReset();
		mocks.wsConnSeq = 0;

		mocks.getAccountInfo.mockImplementation((pk: PublicKey) => {
			if (pk.equals(DEX_CONFIG_PDA)) return Promise.resolve(fakeConfigInfo);
			return Promise.resolve(fakePoolInfo);
		});
		mocks.parsePoolState.mockReturnValue(FAKE_POOL);
		mocks.parseDexConfig.mockReturnValue(FAKE_CONFIG);
		mocks.quoteSwap.mockReturnValue({
			ok: true,
			quote: {
				amountOut: 1_000n,
				netInput: 1_000n,
				fees: { feeTotal: 0n, feeLp: 0n, feeProtocol: 0n, feeOtTreasury: 0n },
				priceImpactBps: 0,
				reserveInBefore: 0n,
				reserveOutBefore: 0n,
				reserveInAfter: 0n,
				reserveOutAfter: 0n
			}
		});

		// Connection.onAccountChange returns a numeric listener id.
		let nextId = 100;
		mocks.connectionA.onAccountChange.mockImplementation(() => nextId++);
		mocks.connectionB.onAccountChange.mockImplementation(() => nextId++);

		const mod = await import('./quote.svelte');
		quote = mod.quote;
		// Reset module-level state between tests.
		quote.deactivate();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('FQ-1 200ms debounce: rapid setInput collapses to one recompute', async () => {
		await quote.activatePool(makeEntry(POOL_PDA_A));
		await settle();

		// activatePool fires one immediate recompute on load (input is 0n so
		// quote stays null). Reset the call counter to isolate this test.
		mocks.quoteSwap.mockClear();

		quote.setInput(100n, USDC_MINT, RWT_MINT);
		quote.setInput(200n, USDC_MINT, RWT_MINT);
		quote.setInput(300n, USDC_MINT, RWT_MINT);

		// Before the debounce expires: no recompute has run.
		await vi.advanceTimersByTimeAsync(100);
		expect(mocks.quoteSwap).not.toHaveBeenCalled();

		// After debounce: exactly one recompute, with the LAST value.
		await vi.advanceTimersByTimeAsync(200);
		expect(mocks.quoteSwap).toHaveBeenCalledTimes(1);
		expect(mocks.quoteSwap).toHaveBeenLastCalledWith(
			expect.objectContaining({ amountIn: 300n })
		);
	});

	it('FQ-2 WS pool update triggers recompute', async () => {
		await quote.activatePool(makeEntry(POOL_PDA_A));
		await settle();

		// Capture the pool listener that was registered on connectionA.
		expect(mocks.connectionA.onAccountChange).toHaveBeenCalled();
		const poolListener = mocks.connectionA.onAccountChange.mock.calls[0][1];

		// Set an input so the recompute has something to compute.
		quote.setInput(500n, USDC_MINT, RWT_MINT);
		await vi.advanceTimersByTimeAsync(200);
		mocks.quoteSwap.mockClear();

		// Simulate a WS event: the pool reserves changed.
		const NEW_POOL_DATA = { data: new Uint8Array([99]), executable: false, lamports: 0, owner: USDC_MINT };
		poolListener(NEW_POOL_DATA);

		// `parsePoolState` was called with the new bytes and quoteSwap re-ran.
		expect(mocks.parsePoolState).toHaveBeenLastCalledWith(NEW_POOL_DATA.data);
		expect(mocks.quoteSwap).toHaveBeenCalledTimes(1);
	});

	it('FQ-3 switch pool tears down old subscription on the same Connection', async () => {
		await quote.activatePool(makeEntry(POOL_PDA_A));
		await settle();

		// Two listeners (pool + config) were registered on connectionA.
		expect(mocks.connectionA.onAccountChange).toHaveBeenCalledTimes(2);
		const poolListenerId = mocks.connectionA.onAccountChange.mock.results[0].value;
		const configListenerId = mocks.connectionA.onAccountChange.mock.results[1].value;

		// Switch to a different pool.
		await quote.activatePool(makeEntry(POOL_PDA_B));
		await settle();

		// Old listeners were removed on connectionA (NOT connectionB).
		expect(mocks.connectionA.removeAccountChangeListener).toHaveBeenCalledWith(poolListenerId);
		expect(mocks.connectionA.removeAccountChangeListener).toHaveBeenCalledWith(configListenerId);
		// And the new pool's listeners were registered on connectionB.
		expect(mocks.connectionB.onAccountChange).toHaveBeenCalledTimes(2);
		// connectionB never had its remove-listener called — old cycle did
		// not leak to the wrong Connection.
		expect(mocks.connectionB.removeAccountChangeListener).not.toHaveBeenCalled();
	});

	it('does not recompute quote during pool switch transition window (FQ-3 explicit assertion)', async () => {
		// Activate pool A and capture the WS listener registered against
		// connectionA. The store wires the listener with a closure over the
		// poolKey; once we switch to pool B the closure becomes stale.
		await quote.activatePool(makeEntry(POOL_PDA_A));
		await settle();
		const stalePoolListener = mocks.connectionA.onAccountChange.mock.calls[0][1];

		// Set an input so the quote pipeline is "warm" — without an input,
		// recomputeQuote bails out early anyway and the assertion would be
		// vacuous.
		quote.setInput(500n, USDC_MINT, RWT_MINT);
		await vi.advanceTimersByTimeAsync(200);

		// Switch to a different pool. Mid-flight (between activatePool returning
		// and any new account info loading), the OLD subscription is the only
		// path that could mutate quote state — and the stale-cycle guard inside
		// the listener must drop the late notification.
		const switchPromise = quote.activatePool(makeEntry(POOL_PDA_B));

		// Spy on quoteSwap from this point. Anything called during the
		// transition window is a regression — the new pool isn't loaded yet,
		// and the old listener fires against state that no longer matches the
		// active poolKey.
		mocks.quoteSwap.mockClear();

		// Simulate a late WS push from the OLD connection (e.g., a pool reserve
		// update queued before our teardown completed). The stale-cycle guard
		// should observe `activePoolKey !== POOL_PDA_A.toBase58()` and bail
		// before calling parsePoolState/quoteSwap.
		const LATE_DATA = { data: new Uint8Array([42]), executable: false, lamports: 0, owner: USDC_MINT };
		stalePoolListener(LATE_DATA);

		// Explicit invariant: zero recomputes triggered by the stale listener.
		expect(mocks.quoteSwap).not.toHaveBeenCalled();
		// And parsePoolState was not even invoked — the guard runs BEFORE the
		// parse, so a malformed late update can't crash us either.
		expect(mocks.parsePoolState).not.toHaveBeenCalledWith(LATE_DATA.data);

		// Drain the switch so afterEach teardown is clean.
		await switchPromise;
		await settle();
	});

	it('FQ-4 slippage change does NOT recompute the quote', async () => {
		await quote.activatePool(makeEntry(POOL_PDA_A));
		await settle();
		quote.setInput(500n, USDC_MINT, RWT_MINT);
		await vi.advanceTimersByTimeAsync(200);

		mocks.quoteSwap.mockClear();

		quote.setSlippage(100);
		quote.setSlippage(50);
		quote.setSlippage(10);

		// Even after the debounce window — no recompute.
		await vi.advanceTimersByTimeAsync(500);
		expect(mocks.quoteSwap).not.toHaveBeenCalled();
		// But the public slippage state DID update.
		expect(quote.slippageBps).toBe(10);
	});

	it('FQ-5: setSlippage clamps to [10, 500] bounds', () => {
		// Below the floor — clamped up to the shared minimum.
		quote.setSlippage(0);
		expect(quote.slippageBps).toBe(10);

		// Above the ceiling — clamped down to the shared maximum.
		quote.setSlippage(10000);
		expect(quote.slippageBps).toBe(500);

		// Inside the window — passes through untouched.
		quote.setSlippage(50);
		expect(quote.slippageBps).toBe(50);
	});
});
