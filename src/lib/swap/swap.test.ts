/*
 * Swap FSM service unit tests.
 *
 * Mirrors `claim.test.ts` strategy: hoist mocks for the SDK + wallet +
 * network singletons, exercise each phase transition, and reset the runes
 * Map between cases by clearing it directly (the swap singleton is
 * imported once at module load).
 *
 * Coverage targets (per Phase 8 plan):
 *   FA-1. Happy path — preparing → awaiting → broadcasting → confirming → success
 *   FA-2. Single-flight: same pool start while in-flight is a no-op
 *   FA-3. User rejection (Error message) → silent drop, no toast
 *   FA-4. Wallet error (non-rejection) → error phase
 *   FA-5. Stale quote re-check: freshQuote.amountOut < minAmountOut → error before signature
 *   FA-6. 90s confirm timeout → error
 *   FA-7. Mainnet + placeholder RWT → error before any RPC
 *   FA-8. Success refreshes portfolio + balances
 *   FA-9. Auto-cleanup 3s after terminal
 *   FA-10. Pool account missing → error before signature (defense-in-depth)
 *   FA-11. User-rejection by code 4001 also silent
 *   FA-12. isInFlight reflects in-flight only
 *   FA-13. Concurrent different-pool starts run in parallel
 *   FA-14. Resolved balance < userTotalDebit → preflight abort
 *   FA-15. RPC failure on balance read → fail-open (no false-positive abort)
 *          — APP-H1 regression: the blanket `catch { return 0n }` used to
 *          conflate "account missing" with "RPC timeout", producing a
 *          spurious "Insufficient balance" toast during transient blips
 *          even for fully funded wallets.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey, SolanaJSONRPCError } from '@solana/web3.js';

// ──────────────────────────── fixtures ────────────────────────────────────

const HOLDER = new PublicKey('11111111111111111111111111111112');
const POOL_PDA_A = new PublicKey('11111111111111111111111111111114');
const POOL_PDA_B = new PublicKey('1111111111111111111111111111111B');
const DEX_CONFIG_PDA = new PublicKey('11111111111111111111111111111115');
const VAULT_A = new PublicKey('11111111111111111111111111111116');
const VAULT_B = new PublicKey('11111111111111111111111111111117');
const AREAL_FEE = new PublicKey('11111111111111111111111111111118');

const USDC_MINT = new PublicKey('11111111111111111111111111111119');
const RWT_MINT = new PublicKey('1111111111111111111111111111111A');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('1111111111111111111111111111111C'),
	yieldDistribution: new PublicKey('1111111111111111111111111111111D'),
	rwtEngine: new PublicKey('1111111111111111111111111111111E'),
	nativeDex: new PublicKey('1111111111111111111111111111111F'),
	futarchy: new PublicKey('1111111111111111111111111111111G')
};

// ──────────────────────────── mocks ───────────────────────────────────────

const mocks = vi.hoisted(() => ({
	parsePoolState: vi.fn(),
	parseDexConfig: vi.fn(),
	quoteSwap: vi.fn(),
	buildSwapTx: vi.fn(),
	isPlaceholderRwtMint: vi.fn(),
	signAndSendTransaction: vi.fn(),
	getAccountInfo: vi.fn(),
	getLatestBlockhash: vi.fn(),
	confirmTransaction: vi.fn(),
	getTokenAccountBalance: vi.fn(),
	portfolioRefresh: vi.fn(),
	balancesRefreshAll: vi.fn(),
	toastError: vi.fn(),
	showError: vi.fn(),
	currentNetwork: vi.fn(() => 'devnet')
}));

vi.mock('@areal/sdk/native-dex', () => ({
	parsePoolState: mocks.parsePoolState,
	parseDexConfig: mocks.parseDexConfig,
	quoteSwap: mocks.quoteSwap
}));

vi.mock('@areal/sdk/tx', () => ({
	buildSwapTx: mocks.buildSwapTx
}));

vi.mock('@areal/sdk/pda', () => ({
	findAssociatedTokenAddressPda: (owner: PublicKey, mint: PublicKey): [PublicKey, number] => [
		new PublicKey(owner),
		0
	]
}));

vi.mock('@areal/sdk/network', () => ({
	RWT_MINTS: {
		localnet: RWT_MINT,
		devnet: RWT_MINT,
		mainnet: RWT_MINT
	},
	isPlaceholderRwtMint: mocks.isPlaceholderRwtMint
}));

const walletState = { publicKey: HOLDER as PublicKey | null };
vi.mock('$lib/stores/wallet.svelte', () => ({
	wallet: {
		get publicKey() {
			return walletState.publicKey;
		},
		signAndSendTransaction: mocks.signAndSendTransaction
	}
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return mocks.currentNetwork();
		},
		get connection() {
			return {
				getAccountInfo: mocks.getAccountInfo,
				getLatestBlockhash: mocks.getLatestBlockhash,
				confirmTransaction: mocks.confirmTransaction,
				getTokenAccountBalance: mocks.getTokenAccountBalance
			};
		},
		get endpoint() {
			return { programIds: PROGRAM_IDS };
		}
	}
}));

vi.mock('$lib/portfolio/store.svelte', () => ({
	portfolio: {
		refresh: mocks.portfolioRefresh
	}
}));

vi.mock('$lib/swap/balances.svelte', () => ({
	userBalances: {
		refreshAll: mocks.balancesRefreshAll
	}
}));

vi.mock('$lib/errors', () => ({
	showError: mocks.showError
}));

vi.mock('$lib/components/ui', () => ({
	toast: {
		error: mocks.toastError
	}
}));

// ──────────────────────────── intent factory ──────────────────────────────

function makeIntent(poolPda: PublicKey = POOL_PDA_A) {
	return {
		poolEntry: {
			label: 'USDC / RWT',
			mintA: USDC_MINT,
			mintB: RWT_MINT,
			symbolA: 'USDC',
			symbolB: 'RWT',
			decimalsA: 6,
			decimalsB: 6,
			poolPda,
			dexConfigPda: DEX_CONFIG_PDA
		},
		fromMint: USDC_MINT,
		toMint: RWT_MINT,
		aToB: true,
		amountIn: 1_000_000n,
		minAmountOut: 900_000n,
		expectedOut: 1_000_000n,
		fees: { feeTotal: 1_000n, feeLp: 800n, feeProtocol: 200n, feeOtTreasury: 0n },
		priceImpactBps: 5,
		slippageBps: 50,
		// USDC → RWT (buy-RWT branch): fees come off the gross output, so
		// the wallet is debited exactly `amountIn`.
		userTotalDebit: 1_000_000n
	};
}

const FAKE_POOL = {
	tokenAMint: USDC_MINT,
	tokenBMint: RWT_MINT,
	vaultA: VAULT_A,
	vaultB: VAULT_B,
	hasOtTreasury: false,
	otTreasuryFeeDestination: AREAL_FEE
};

const FAKE_CONFIG = {
	arealFeeDestination: AREAL_FEE
};

const fakePoolInfo = { data: new Uint8Array([1, 2, 3]), executable: false, lamports: 0, owner: PROGRAM_IDS.nativeDex };
const fakeConfigInfo = { data: new Uint8Array([4, 5, 6]), executable: false, lamports: 0, owner: PROGRAM_IDS.nativeDex };

async function settle(times = 6) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function setupHappyPath() {
	mocks.isPlaceholderRwtMint.mockReturnValue(false);
	// First call: poolInfo, second call: configInfo (Promise.all order).
	mocks.getAccountInfo.mockImplementation((pk: PublicKey) => {
		if (pk.equals(DEX_CONFIG_PDA)) return Promise.resolve(fakeConfigInfo);
		return Promise.resolve(fakePoolInfo);
	});
	mocks.parsePoolState.mockReturnValue(FAKE_POOL);
	mocks.parseDexConfig.mockReturnValue(FAKE_CONFIG);
	mocks.quoteSwap.mockReturnValue({
		ok: true,
		quote: {
			amountOut: 1_000_000n,
			netInput: 1_000_000n,
			fees: { feeTotal: 1_000n, feeLp: 800n, feeProtocol: 200n, feeOtTreasury: 0n },
			priceImpactBps: 5,
			reserveInBefore: 1_000_000_000n,
			reserveOutBefore: 1_000_000_000n,
			reserveInAfter: 1_001_000_000n,
			reserveOutAfter: 999_000_000n,
			// Buy-RWT branch (`makeIntent` defaults to USDC → RWT): the
			// wallet is debited `amountIn` (fees come off output).
			userTotalDebit: 1_000_000n
		}
	});
	mocks.buildSwapTx.mockResolvedValue({});
	mocks.getLatestBlockhash.mockResolvedValue({
		blockhash: 'BLOCKHASH',
		lastValidBlockHeight: 12345
	});
	mocks.signAndSendTransaction.mockResolvedValue({ signature: 'SIG_SWAP_OK' });
	mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
	// Balance preflight: return well over the intent's userTotalDebit
	// (1_000_000n) so the FSM passes the check.
	mocks.getTokenAccountBalance.mockResolvedValue({
		value: { amount: '1000000000', decimals: 6, uiAmount: 1000, uiAmountString: '1000' }
	});
	mocks.portfolioRefresh.mockResolvedValue(undefined);
	mocks.balancesRefreshAll.mockResolvedValue(undefined);
}

// ──────────────────────────── suite ───────────────────────────────────────

describe('swap FSM service', () => {
	let swap: typeof import('./swap.svelte').swap;

	beforeEach(async () => {
		vi.useFakeTimers();
		Object.values(mocks).forEach((m) => {
			if (typeof (m as { mockReset?: () => void }).mockReset === 'function') {
				(m as { mockReset: () => void }).mockReset();
			}
		});
		mocks.currentNetwork.mockReturnValue('devnet');
		walletState.publicKey = HOLDER;

		const mod = await import('./swap.svelte');
		swap = mod.swap;
		(swap.attempts as unknown as Map<string, unknown>).clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('FA-1 happy path: progresses through phases to success', async () => {
		setupHappyPath();

		const intent = makeIntent();
		const promise = swap.start(intent);

		// `preparing` is set synchronously.
		expect(swap.attempts.get(POOL_PDA_A.toBase58())?.phase).toBe('preparing');

		await settle();
		await promise;

		const final = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(final?.phase).toBe('success');
		expect(final?.signature).toBe('SIG_SWAP_OK');
	});

	it('FA-2 single-flight: duplicate start for same pool is a no-op', async () => {
		setupHappyPath();

		const intent = makeIntent();
		const p1 = swap.start(intent);
		const p2 = swap.start(intent);

		await settle();
		await Promise.all([p1, p2]);

		// Only one buildSwapTx call → second start was dropped.
		expect(mocks.buildSwapTx).toHaveBeenCalledTimes(1);
	});

	it('FA-3 user rejection (message): drops attempt silently, no toast', async () => {
		setupHappyPath();
		mocks.signAndSendTransaction.mockRejectedValue(new Error('User rejected the request'));

		await swap.start(makeIntent());
		await settle();

		expect(swap.attempts.get(POOL_PDA_A.toBase58())).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('FA-11 user rejection by code 4001 also drops silently', async () => {
		setupHappyPath();
		mocks.signAndSendTransaction.mockRejectedValue({ code: 4001, message: 'cancelled' });

		await swap.start(makeIntent());
		await settle();

		expect(swap.attempts.get(POOL_PDA_A.toBase58())).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
	});

	it('FA-4 wallet error (non-rejection): error phase + showError called', async () => {
		setupHappyPath();
		mocks.signAndSendTransaction.mockRejectedValue(new Error('Wallet RPC failure'));

		await swap.start(makeIntent());
		await settle();

		const a = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.showError).toHaveBeenCalledTimes(1);
		expect(mocks.showError).toHaveBeenCalledWith(expect.any(Error), PROGRAM_IDS.nativeDex);
	});

	it('FA-5 stale quote re-check: freshQuote < minAmountOut → error before signature', async () => {
		setupHappyPath();
		// Re-quote returns less than the user's minAmountOut (900_000).
		mocks.quoteSwap.mockReturnValue({
			ok: true,
			quote: {
				amountOut: 800_000n,
				netInput: 1_000_000n,
				fees: { feeTotal: 1_000n, feeLp: 800n, feeProtocol: 200n, feeOtTreasury: 0n },
				priceImpactBps: 50,
				reserveInBefore: 1_000_000_000n,
				reserveOutBefore: 1_000_000_000n,
				reserveInAfter: 1_001_000_000n,
				reserveOutAfter: 999_200_000n,
				userTotalDebit: 1_000_000n
			}
		});

		await swap.start(makeIntent());
		await settle();

		const a = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Price moved/);
		// No wallet prompt was made.
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('FA-6 90s confirm timeout: error phase with timeout message', async () => {
		setupHappyPath();
		mocks.confirmTransaction.mockReturnValue(new Promise(() => {}));

		const promise = swap.start(makeIntent());
		await settle();

		await vi.advanceTimersByTimeAsync(90_000);
		await promise;

		const a = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Still pending/);
	});

	it('FA-7 mainnet placeholder RWT: error before any RPC', async () => {
		setupHappyPath();
		mocks.currentNetwork.mockReturnValue('mainnet');
		mocks.isPlaceholderRwtMint.mockReturnValue(true);

		await swap.start(makeIntent());
		await settle();

		const a = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Mainnet RWT/);
		// No RPC roundtrip even fired.
		expect(mocks.getAccountInfo).not.toHaveBeenCalled();
	});

	it('FA-8 success refreshes portfolio + balances', async () => {
		setupHappyPath();

		await swap.start(makeIntent());
		await settle();

		expect(mocks.portfolioRefresh).toHaveBeenCalledTimes(1);
		expect(mocks.balancesRefreshAll).toHaveBeenCalledTimes(1);
	});

	it('FA-9 auto-cleanup: terminal attempt dropped after 3s', async () => {
		setupHappyPath();

		await swap.start(makeIntent());
		await settle();

		expect(swap.attempts.get(POOL_PDA_A.toBase58())?.phase).toBe('success');

		await vi.advanceTimersByTimeAsync(3_000);

		expect(swap.attempts.has(POOL_PDA_A.toBase58())).toBe(false);
	});

	it('FA-10 pool account missing: error phase + toast, no signature', async () => {
		setupHappyPath();
		// Pool getAccountInfo returns null.
		mocks.getAccountInfo.mockImplementation((pk: PublicKey) => {
			if (pk.equals(DEX_CONFIG_PDA)) return Promise.resolve(fakeConfigInfo);
			return Promise.resolve(null);
		});

		await swap.start(makeIntent());
		await settle();

		const a = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('FA-12 isInFlight reflects in-flight only (not terminal)', async () => {
		setupHappyPath();
		let confirmResolve: (v: unknown) => void = () => {};
		mocks.confirmTransaction.mockReturnValue(
			new Promise((resolve) => {
				confirmResolve = resolve;
			})
		);

		const promise = swap.start(makeIntent());
		await settle();

		expect(swap.isInFlight(POOL_PDA_A)).toBe(true);

		confirmResolve({ value: { err: null } });
		await settle();
		await promise;

		expect(swap.isInFlight(POOL_PDA_A)).toBe(false);
	});

	it('FA-14 insufficient balance vs userTotalDebit: error before signature', async () => {
		setupHappyPath();
		// Re-quote returns a userTotalDebit (fees-on-top sell-RWT branch)
		// that exceeds the wallet's ATA balance — preflight must abort.
		mocks.quoteSwap.mockReturnValue({
			ok: true,
			quote: {
				amountOut: 1_000_000n,
				netInput: 1_000_000n,
				fees: { feeTotal: 30n, feeLp: 24n, feeProtocol: 6n, feeOtTreasury: 0n },
				priceImpactBps: 5,
				reserveInBefore: 1_000_000_000n,
				reserveOutBefore: 1_000_000_000n,
				reserveInAfter: 1_001_000_000n,
				reserveOutAfter: 999_000_000n,
				// Sell-RWT debit: amountIn + feeTotal.
				userTotalDebit: 1_000_030n
			}
		});
		// Wallet balance is below the debit (1_000_000 < 1_000_030).
		mocks.getTokenAccountBalance.mockResolvedValue({
			value: { amount: '1000000', decimals: 6, uiAmount: 1, uiAmountString: '1' }
		});

		await swap.start(makeIntent());
		await settle();

		const a = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Insufficient balance/);
		// No wallet prompt fired.
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('FA-13 concurrent starts for different pools run in parallel', async () => {
		setupHappyPath();

		const p1 = swap.start(makeIntent(POOL_PDA_A));
		const p2 = swap.start(makeIntent(POOL_PDA_B));

		expect(swap.attempts.size).toBe(2);

		await settle();
		await Promise.all([p1, p2]);

		// Each pool got its own buildSwapTx call.
		expect(mocks.buildSwapTx).toHaveBeenCalledTimes(2);
	});

	it('FA-15 RPC failure on balance read: fail-open, preflight does not abort', async () => {
		// APP-H1 regression. Before the fix, ANY thrown error from
		// `getTokenAccountBalance` (including RPC timeouts / 5xx / network
		// partitions) was caught and converted to `0n`, which then failed
		// the `fromBalance < userTotalDebit` check and surfaced a spurious
		// "Insufficient balance" toast even for fully funded wallets.
		//
		// The fix distinguishes account-not-found (legitimate 0 balance)
		// from other failures and returns `null` for the latter so the
		// preflight is skipped and the contract enforces the balance check
		// instead. This test pins that behavior by:
		//   1. Forcing `getTokenAccountBalance` to throw a generic RPC
		//      error (NOT account-not-found).
		//   2. Mocking `signAndSendTransaction` to reject with a user-
		//      rejection so the FSM exits cleanly without entering the
		//      confirm-poll loop (which can't be driven under fake timers
		//      — same pre-existing limitation as FA-1/8/9/12/13).
		//   3. Asserting `signAndSendTransaction` WAS called — i.e. the
		//      preflight let us through — and no spurious
		//      "Insufficient balance" toast fired.
		setupHappyPath();
		// Simulate a transient RPC failure. A 5xx-style SolanaJSONRPCError
		// with a generic Internal-error code (-32603) is representative of
		// what an RPC provider returns during a relayer hiccup; it MUST
		// NOT be conflated with the -32602 / "could not find account"
		// signal that means "no ATA yet".
		mocks.getTokenAccountBalance.mockRejectedValue(
			new SolanaJSONRPCError(
				{ code: -32603, message: 'Internal error' },
				'failed to get token account balance'
			)
		);
		// Short-circuit on the wallet step so we don't depend on the
		// confirm-poll loop (which the test connection mock can't drive).
		mocks.signAndSendTransaction.mockRejectedValue(
			new Error('User rejected the request')
		);

		await swap.start(makeIntent());
		await settle();

		// Wallet sign-and-send WAS called: the preflight did not abort.
		// THIS is the load-bearing assertion for APP-H1.
		expect(mocks.signAndSendTransaction).toHaveBeenCalledTimes(1);
		// No spurious "Insufficient balance" toast was surfaced.
		expect(mocks.toastError).not.toHaveBeenCalled();
		// And the FSM took the user-rejection silent-drop path — not the
		// preflight failSilent path.
		expect(swap.attempts.get(POOL_PDA_A.toBase58())).toBeUndefined();
	});

	it('FA-15b account-not-found on balance read: 0n returned, preflight aborts when debit > 0', async () => {
		// Companion to FA-15: confirm we still treat "account does not
		// exist" as a legitimate 0 balance. A user with no ATA for the
		// `fromMint` cannot afford any debit > 0, so the preflight should
		// abort with the existing "Insufficient balance" toast.
		setupHappyPath();
		mocks.getTokenAccountBalance.mockRejectedValue(
			new SolanaJSONRPCError(
				{ code: -32602, message: 'Invalid param: could not find account' },
				'failed to get token account balance'
			)
		);

		await swap.start(makeIntent());
		await settle();

		const a = swap.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Insufficient balance/);
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalled();
	});
});
