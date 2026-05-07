/*
 * Mint FSM service unit tests.
 *
 * Mirrors `swap.test.ts` strategy: hoist mocks for the SDK + wallet +
 * network singletons, exercise each phase transition, and reset the runes
 * Map between cases by clearing it directly (the mint singleton is
 * imported once at module load).
 *
 * Coverage targets (per Phase 10 plan):
 *   FM-1.  Happy path — preparing → awaiting → broadcasting → confirming → success
 *   FM-2.  Single-flight: second start while in-flight is a no-op
 *   FM-3.  User rejection (msg) → silent drop, no toast
 *   FM-4.  User rejection (code 4001) → silent drop
 *   FM-5.  Stale NAV: freshQuote.rwtOut < minRwtOut → error before signature
 *   FM-6.  mintPaused flips on between quote and confirm → error before sig
 *   FM-7.  Mainnet + placeholder RWT → error before any RPC
 *   FM-8.  90s confirm timeout → error
 *   FM-9.  Wallet disconnect mid-flow → graceful failSilent
 *   FM-10. Auto-cleanup 3s after terminal phase
 *   FM-11. Success calls portfolio.refresh + balances.refreshAll
 *   FM-12. isInFlight reflects in-flight only
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

// ──────────────────────────── fixtures ────────────────────────────────────

const HOLDER = new PublicKey('11111111111111111111111111111112');
const VAULT_PDA = new PublicKey('11111111111111111111111111111114');
const RWT_MINT = new PublicKey('1111111111111111111111111111111A');
const USDC_MINT = new PublicKey('11111111111111111111111111111119');
const CAPITAL_ACC = new PublicKey('11111111111111111111111111111116');
const AREAL_FEE = new PublicKey('11111111111111111111111111111118');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('1111111111111111111111111111111C'),
	yieldDistribution: new PublicKey('1111111111111111111111111111111D'),
	rwtEngine: new PublicKey('1111111111111111111111111111111E'),
	nativeDex: new PublicKey('1111111111111111111111111111111F'),
	futarchy: new PublicKey('1111111111111111111111111111111G')
};

// ──────────────────────────── mocks ───────────────────────────────────────

const mocks = vi.hoisted(() => ({
	parseRwtVault: vi.fn(),
	quoteMintRwt: vi.fn(),
	buildMintRwtTx: vi.fn(),
	isPlaceholderRwtMint: vi.fn(),
	signAndSendTransaction: vi.fn(),
	getAccountInfo: vi.fn(),
	getLatestBlockhash: vi.fn(),
	confirmTransaction: vi.fn(),
	portfolioRefresh: vi.fn(),
	balancesRefreshAll: vi.fn(),
	toastError: vi.fn(),
	showError: vi.fn(),
	currentNetwork: vi.fn(() => 'devnet'),
	// `walletPublicKey` is initialised in `beforeEach` to dodge the
	// `vi.hoisted` -> top-level dance (the const HOLDER below isn't in
	// scope yet inside the hoisted factory).
	walletPublicKey: null as PublicKey | null
}));

vi.mock('@areal/sdk/rwt-engine', () => ({
	parseRwtVault: mocks.parseRwtVault,
	quoteMintRwt: mocks.quoteMintRwt
}));

vi.mock('@areal/sdk/tx', () => ({
	buildMintRwtTx: mocks.buildMintRwtTx
}));

vi.mock('@areal/sdk/pda', () => ({
	findAssociatedTokenAddressPda: (owner: PublicKey, mint: PublicKey): [PublicKey, number] => [
		new PublicKey(owner),
		0
	],
	findRwtVaultPda: (): [PublicKey, number] => [VAULT_PDA, 0]
}));

vi.mock('@areal/sdk/network', () => ({
	RWT_MINTS: {
		localnet: RWT_MINT,
		devnet: RWT_MINT,
		mainnet: RWT_MINT
	},
	USDC_MINTS: {
		localnet: USDC_MINT,
		devnet: USDC_MINT,
		mainnet: USDC_MINT
	},
	isPlaceholderRwtMint: mocks.isPlaceholderRwtMint
}));

vi.mock('$lib/stores/wallet.svelte', () => ({
	wallet: {
		get publicKey() {
			return mocks.walletPublicKey;
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
				confirmTransaction: mocks.confirmTransaction
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

function makeIntent() {
	return {
		amountIn: 10_000_000n, // 10 USDC
		minRwtOut: 9_900_000n,
		expectedRwt: 9_950_000n,
		navAtQuote: 1_000_000n,
		fees: { feeTotal: 50_000n, feeDao: 25_000n, feeVault: 25_000n, netDeposit: 9_950_000n },
		slippageBps: 50
	};
}

const FAKE_VAULT = {
	totalInvestedCapital: 1_000_000n,
	totalRwtSupply: 1_000_000n,
	mintPaused: false,
	navBookValue: 1_000_000n,
	capitalAccumulatorAta: CAPITAL_ACC,
	rwtMint: RWT_MINT,
	authority: RWT_MINT,
	pendingAuthority: RWT_MINT,
	hasPending: false,
	manager: RWT_MINT,
	pauseAuthority: RWT_MINT,
	arealFeeDestination: AREAL_FEE,
	bump: 0
};

const fakeVaultInfo = {
	data: new Uint8Array([1, 2, 3]),
	executable: false,
	lamports: 0,
	owner: PROGRAM_IDS.rwtEngine
};

async function settle(times = 6) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function setupHappyPath() {
	mocks.isPlaceholderRwtMint.mockReturnValue(false);
	mocks.getAccountInfo.mockResolvedValue(fakeVaultInfo);
	mocks.parseRwtVault.mockReturnValue(FAKE_VAULT);
	mocks.quoteMintRwt.mockReturnValue({
		ok: true,
		quote: {
			rwtOut: 9_950_000n,
			netDeposit: 9_950_000n,
			fees: { feeTotal: 50_000n, feeDao: 25_000n, feeVault: 25_000n, netDeposit: 9_950_000n },
			navAtQuote: 1_000_000n,
			capitalAfter: 10_950_000n,
			supplyAfter: 10_950_000n,
			navAfter: 1_000_000n
		}
	});
	mocks.buildMintRwtTx.mockResolvedValue({});
	mocks.getLatestBlockhash.mockResolvedValue({
		blockhash: 'BLOCKHASH',
		lastValidBlockHeight: 12345
	});
	mocks.signAndSendTransaction.mockResolvedValue({ signature: 'SIG_MINT_OK' });
	mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
	mocks.portfolioRefresh.mockResolvedValue(undefined);
	mocks.balancesRefreshAll.mockResolvedValue(undefined);
}

// ──────────────────────────── suite ───────────────────────────────────────

describe('mint FSM service', () => {
	let mint: typeof import('./mint.svelte').mint;

	beforeEach(async () => {
		vi.useFakeTimers();
		Object.values(mocks).forEach((m) => {
			if (m !== null && typeof (m as { mockReset?: () => void }).mockReset === 'function') {
				(m as { mockReset: () => void }).mockReset();
			}
		});
		mocks.currentNetwork.mockReturnValue('devnet');
		mocks.walletPublicKey = HOLDER;

		const mod = await import('./mint.svelte');
		mint = mod.mint;
		(mint.attempts as unknown as Map<string, unknown>).clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('FM-1 happy path: progresses through phases to success', async () => {
		setupHappyPath();

		const promise = mint.start(makeIntent());

		// `preparing` is set synchronously.
		expect(mint.attempts.get('mint')?.phase).toBe('preparing');

		await settle();
		await promise;

		const final = mint.attempts.get('mint');
		expect(final?.phase).toBe('success');
		expect(final?.signature).toBe('SIG_MINT_OK');
	});

	it('FM-2 single-flight: duplicate start while in-flight is a no-op', async () => {
		setupHappyPath();

		const p1 = mint.start(makeIntent());
		const p2 = mint.start(makeIntent());

		await settle();
		await Promise.all([p1, p2]);

		// Only one buildMintRwtTx call → second start was dropped.
		expect(mocks.buildMintRwtTx).toHaveBeenCalledTimes(1);
	});

	it('FM-3 user rejection (message): drops attempt silently, no toast', async () => {
		setupHappyPath();
		mocks.signAndSendTransaction.mockRejectedValue(new Error('User rejected the request'));

		await mint.start(makeIntent());
		await settle();

		expect(mint.attempts.get('mint')).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('FM-4 user rejection (code 4001) also drops silently', async () => {
		setupHappyPath();
		mocks.signAndSendTransaction.mockRejectedValue({ code: 4001, message: 'cancelled' });

		await mint.start(makeIntent());
		await settle();

		expect(mint.attempts.get('mint')).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
	});

	it('FM-5 stale NAV: freshQuote.rwtOut < minRwtOut → error before signature', async () => {
		setupHappyPath();
		// Re-quote returns less than the user's minRwtOut (9_900_000).
		mocks.quoteMintRwt.mockReturnValue({
			ok: true,
			quote: {
				rwtOut: 9_500_000n,
				netDeposit: 9_500_000n,
				fees: { feeTotal: 50_000n, feeDao: 25_000n, feeVault: 25_000n, netDeposit: 9_500_000n },
				navAtQuote: 1_050_000n,
				capitalAfter: 10_500_000n,
				supplyAfter: 10_500_000n,
				navAfter: 1_050_000n
			}
		});

		await mint.start(makeIntent());
		await settle();

		const a = mint.attempts.get('mint');
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/NAV moved/);
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('FM-6 mintPaused flipped on → error before signature', async () => {
		setupHappyPath();
		mocks.parseRwtVault.mockReturnValue({ ...FAKE_VAULT, mintPaused: true });

		await mint.start(makeIntent());
		await settle();

		const a = mint.attempts.get('mint');
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/paused/i);
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.quoteMintRwt).not.toHaveBeenCalled();
	});

	it('FM-7 mainnet placeholder RWT: error before any RPC', async () => {
		setupHappyPath();
		mocks.currentNetwork.mockReturnValue('mainnet');
		mocks.isPlaceholderRwtMint.mockReturnValue(true);

		await mint.start(makeIntent());
		await settle();

		const a = mint.attempts.get('mint');
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Mainnet RWT/);
		// No RPC roundtrip even fired.
		expect(mocks.getAccountInfo).not.toHaveBeenCalled();
	});

	it('FM-8 90s confirm timeout: error phase with timeout message', async () => {
		setupHappyPath();
		mocks.confirmTransaction.mockReturnValue(new Promise(() => {}));

		const promise = mint.start(makeIntent());
		await settle();

		await vi.advanceTimersByTimeAsync(90_000);
		await promise;

		const a = mint.attempts.get('mint');
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Still pending/);
	});

	it('FM-9 wallet disconnected: error before any RPC', async () => {
		setupHappyPath();
		mocks.walletPublicKey = null;

		await mint.start(makeIntent());
		await settle();

		const a = mint.attempts.get('mint');
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Wallet not connected/);
		expect(mocks.getAccountInfo).not.toHaveBeenCalled();
	});

	it('FM-10 auto-cleanup: terminal attempt dropped after 3s', async () => {
		setupHappyPath();

		await mint.start(makeIntent());
		await settle();

		expect(mint.attempts.get('mint')?.phase).toBe('success');

		await vi.advanceTimersByTimeAsync(3_000);

		expect(mint.attempts.has('mint')).toBe(false);
	});

	it('FM-11 success refreshes portfolio + balances', async () => {
		setupHappyPath();

		await mint.start(makeIntent());
		await settle();

		expect(mocks.portfolioRefresh).toHaveBeenCalledTimes(1);
		expect(mocks.balancesRefreshAll).toHaveBeenCalledTimes(1);
	});

	it('FM-12 isInFlight reflects in-flight only (not terminal)', async () => {
		setupHappyPath();
		let confirmResolve: (v: unknown) => void = () => {};
		mocks.confirmTransaction.mockReturnValue(
			new Promise((resolve) => {
				confirmResolve = resolve;
			})
		);

		const promise = mint.start(makeIntent());
		await settle();

		expect(mint.isInFlight()).toBe(true);

		confirmResolve({ value: { err: null } });
		await settle();
		await promise;

		expect(mint.isInFlight()).toBe(false);
	});
});
