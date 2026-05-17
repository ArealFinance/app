/*
 * LP-form FSM service unit tests.
 *
 * Mirrors `swap.test.ts` strategy: hoist mocks for the SDK + wallet +
 * network singletons, exercise each phase transition, and reset the runes
 * Map between cases by clearing it directly (the lpForm singleton is
 * imported once at module load).
 *
 * Coverage targets (per Phase 11 plan):
 *   FA-1.  Add happy path: preparing → awaiting → broadcasting → confirming → success
 *   FA-2.  Zap happy path
 *   FA-3.  Remove happy path
 *   FA-4.  Single-flight per pool — second start while in-flight is a no-op
 *   FA-5.  User rejection (4001) → silent drop, no toast
 *   FA-6.  Master-pool block on Add → error before sign (defense-in-depth)
 *   FA-7.  Stale slippage exceeded → abort pre-sign
 *   FA-8.  90s confirm timeout → error
 *   FA-9.  Both-zero amounts on Add rejected pre-flight
 *   FA-10. Mainnet placeholder → error before any RPC
 *   FA-11. Success refreshes lpStore + portfolio + balances
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

// ──────────────────────────── fixtures ────────────────────────────────────

const HOLDER = new PublicKey('11111111111111111111111111111112');
const POOL_PDA_A = new PublicKey('11111111111111111111111111111114');
const POOL_PDA_B = new PublicKey('1111111111111111111111111111111B');
const DEX_CONFIG_PDA = new PublicKey('11111111111111111111111111111115');
const VAULT_A = new PublicKey('11111111111111111111111111111116');
const VAULT_B = new PublicKey('11111111111111111111111111111117');
const AREAL_FEE = new PublicKey('11111111111111111111111111111118');
const LP_PDA = new PublicKey('11111111111111111111111111111119');

const USDC_MINT = new PublicKey('1111111111111111111111111111111A');
const RWT_MINT = new PublicKey('1111111111111111111111111111111B');
const SPRK_MINT = new PublicKey('1111111111111111111111111111111C');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('1111111111111111111111111111111D'),
	yieldDistribution: new PublicKey('1111111111111111111111111111111E'),
	rwtEngine: new PublicKey('1111111111111111111111111111111F'),
	nativeDex: new PublicKey('1111111111111111111111111111111G'),
	futarchy: new PublicKey('1111111111111111111111111111111H')
};

// ──────────────────────────── mocks ───────────────────────────────────────

const mocks = vi.hoisted(() => ({
	parsePoolState: vi.fn(),
	parseDexConfig: vi.fn(),
	buildAddLiquidityTx: vi.fn(),
	buildZapLiquidityTx: vi.fn(),
	buildRemoveLiquidityTx: vi.fn(),
	isPlaceholderRwtMint: vi.fn(),
	isMasterPool: vi.fn(),
	signAndSendTransaction: vi.fn(),
	getAccountInfo: vi.fn(),
	getLatestBlockhash: vi.fn(),
	confirmTransaction: vi.fn(),
	getSignatureStatuses: vi.fn(),
	getBlockHeight: vi.fn(),
	lpStoreRefresh: vi.fn(),
	portfolioRefresh: vi.fn(),
	balancesRefreshAll: vi.fn(),
	toastError: vi.fn(),
	showError: vi.fn(),
	currentNetwork: vi.fn(() => 'devnet')
}));

vi.mock('@areal/sdk/native-dex', () => ({
	parsePoolState: mocks.parsePoolState,
	parseDexConfig: mocks.parseDexConfig
}));

vi.mock('@areal/sdk/tx', () => ({
	buildAddLiquidityTx: mocks.buildAddLiquidityTx,
	buildZapLiquidityTx: mocks.buildZapLiquidityTx,
	buildRemoveLiquidityTx: mocks.buildRemoveLiquidityTx
}));

vi.mock('@areal/sdk/markets', () => ({
	isMasterPool: mocks.isMasterPool
}));

vi.mock('@areal/sdk/pda', () => ({
	findAssociatedTokenAddressPda: (owner: PublicKey): [PublicKey, number] => [
		new PublicKey(owner),
		0
	],
	findDexConfigPda: () => [DEX_CONFIG_PDA, 255],
	findLpPositionPda: () => [LP_PDA, 255],
	findBinArrayPda: () => [new PublicKey(new Uint8Array(32)), 255]
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
				getSignatureStatuses: mocks.getSignatureStatuses,
				getBlockHeight: mocks.getBlockHeight
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

// lpStore is imported by lp-form for the post-success refresh.
vi.mock('./lp-store.svelte', () => ({
	lpStore: {
		refresh: mocks.lpStoreRefresh
	}
}));

// ──────────────────────────── intent + state factories ────────────────────

function makePoolRow(poolAddress: PublicKey = POOL_PDA_A, isMaster = false) {
	return {
		poolAddress,
		poolType: 0,
		tokenAMint: USDC_MINT,
		tokenBMint: RWT_MINT,
		reserveA: 1_000_000_000n,
		reserveB: 1_000_000_000n,
		feeBps: 30,
		isActive: true,
		hasOtTreasury: false,
		tvlUsdc: 2000,
		tvlSource: 'exact' as const,
		rawPool: {} as never,
		isMaster
	};
}

function makeAddIntent(pool = makePoolRow()) {
	return {
		pool,
		amountA: 1_000_000n,
		amountB: 1_000_000n,
		expectedShares: 1_000_000n,
		minShares: 990_000n,
		slippageBps: 100
	};
}

function makeZapIntent(pool = makePoolRow()) {
	return {
		pool,
		amountA: 1_000_000n,
		amountB: 0n,
		expectedShares: 500_000n,
		minShares: 495_000n,
		slippageBps: 100
	};
}

function makeRemoveIntent(pool = makePoolRow()) {
	return {
		pool,
		sharesToBurn: 100_000n,
		expectedA: 100_000n,
		expectedB: 100_000n,
		slippageBps: 100
	};
}

const FAKE_POOL = {
	tokenAMint: USDC_MINT,
	tokenBMint: RWT_MINT,
	vaultA: VAULT_A,
	vaultB: VAULT_B,
	reserveA: 1_000_000_000n,
	reserveB: 1_000_000_000n,
	totalLpShares: 1_000_000_000n,
	hasOtTreasury: false,
	otTreasuryFeeDestination: AREAL_FEE
};

const FAKE_CONFIG = {
	arealFeeDestination: AREAL_FEE
};

const fakePoolInfo = { data: new Uint8Array([1, 2, 3]), executable: false, lamports: 0, owner: PROGRAM_IDS.nativeDex };
const fakeConfigInfo = { data: new Uint8Array([4, 5, 6]), executable: false, lamports: 0, owner: PROGRAM_IDS.nativeDex };
const fakeLpInfo = { data: new Uint8Array([7, 7, 7]), executable: false, lamports: 0, owner: PROGRAM_IDS.nativeDex };

async function settle(times = 6) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function setupHappyPath() {
	mocks.isPlaceholderRwtMint.mockReturnValue(false);
	mocks.isMasterPool.mockReturnValue(false);

	mocks.getAccountInfo.mockImplementation((pk: PublicKey) => {
		if (pk.equals(DEX_CONFIG_PDA)) return Promise.resolve(fakeConfigInfo);
		if (pk.equals(LP_PDA)) return Promise.resolve(fakeLpInfo);
		return Promise.resolve(fakePoolInfo);
	});

	mocks.parsePoolState.mockReturnValue(FAKE_POOL);
	mocks.parseDexConfig.mockReturnValue(FAKE_CONFIG);

	mocks.buildAddLiquidityTx.mockResolvedValue({});
	mocks.buildZapLiquidityTx.mockResolvedValue({});
	mocks.buildRemoveLiquidityTx.mockResolvedValue({});

	mocks.getLatestBlockhash.mockResolvedValue({
		blockhash: 'BLOCKHASH',
		lastValidBlockHeight: 12345
	});
	mocks.signAndSendTransaction.mockResolvedValue({ signature: 'SIG_LP_OK' });
	mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
	// `confirmWithTimeout` polls `getSignatureStatuses` + `getBlockHeight`
	// (the WS-free path). Happy-path: status reports `confirmed` on the
	// first poll, block-height stays below `lastValidBlockHeight`.
	mocks.getSignatureStatuses.mockResolvedValue({
		value: [{ confirmationStatus: 'confirmed', err: null, slot: 1 }]
	});
	mocks.getBlockHeight.mockResolvedValue(0);

	mocks.lpStoreRefresh.mockResolvedValue(undefined);
	mocks.portfolioRefresh.mockResolvedValue(undefined);
	mocks.balancesRefreshAll.mockResolvedValue(undefined);
}

// ──────────────────────────── suite ───────────────────────────────────────

describe('lp-form FSM service', () => {
	let lpForm: typeof import('./lp-form.svelte').lpForm;

	beforeEach(async () => {
		vi.useFakeTimers();
		Object.values(mocks).forEach((m) => {
			if (typeof (m as { mockReset?: () => void }).mockReset === 'function') {
				(m as { mockReset: () => void }).mockReset();
			}
		});
		mocks.currentNetwork.mockReturnValue('devnet');
		walletState.publicKey = HOLDER;

		const mod = await import('./lp-form.svelte');
		lpForm = mod.lpForm;
		(lpForm.attempts as unknown as Map<string, unknown>).clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('FA-1 add happy path: progresses through phases to success', async () => {
		setupHappyPath();

		const intent = makeAddIntent();
		const promise = lpForm.startAdd(intent);

		expect(lpForm.attempts.get(POOL_PDA_A.toBase58())?.phase).toBe('preparing');

		await settle();
		await promise;

		const final = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(final?.phase).toBe('success');
		expect(final?.signature).toBe('SIG_LP_OK');
		expect(mocks.buildAddLiquidityTx).toHaveBeenCalledTimes(1);
	});

	it('FA-2 zap happy path: progresses to success', async () => {
		setupHappyPath();

		const intent = makeZapIntent();
		await lpForm.startZap(intent);
		await settle();

		const final = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(final?.phase).toBe('success');
		expect(mocks.buildZapLiquidityTx).toHaveBeenCalledTimes(1);
	});

	it('FA-3 remove happy path: progresses to success', async () => {
		setupHappyPath();

		const intent = makeRemoveIntent();
		await lpForm.startRemove(intent);
		await settle();

		const final = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(final?.phase).toBe('success');
		expect(mocks.buildRemoveLiquidityTx).toHaveBeenCalledTimes(1);
	});

	it('FA-4 single-flight: duplicate add for same pool is a no-op', async () => {
		setupHappyPath();

		const intent = makeAddIntent();
		const p1 = lpForm.startAdd(intent);
		const p2 = lpForm.startAdd(intent);

		await settle();
		await Promise.all([p1, p2]);

		// Only one buildAddLiquidityTx call → second start was dropped.
		expect(mocks.buildAddLiquidityTx).toHaveBeenCalledTimes(1);
	});

	it('FA-5 user rejection (4001): drops attempt silently, no toast', async () => {
		setupHappyPath();
		mocks.signAndSendTransaction.mockRejectedValue({ code: 4001, message: 'cancelled' });

		await lpForm.startAdd(makeAddIntent());
		await settle();

		expect(lpForm.attempts.get(POOL_PDA_A.toBase58())).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('FA-6 master-pool blocks Add before any RPC', async () => {
		setupHappyPath();
		mocks.isMasterPool.mockReturnValue(true);

		const intent = makeAddIntent(makePoolRow(POOL_PDA_A, true));
		await lpForm.startAdd(intent);
		await settle();

		const a = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		// CP-11 — wording aligned with contract error
		// (`MasterPoolUserLpDisabled`): "User LP is disabled on this pool."
		expect(a?.error).toMatch(/User LP is disabled/);
		// No RPC roundtrip ever fired.
		expect(mocks.getAccountInfo).not.toHaveBeenCalled();
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('FA-7 stale slippage exceeded: aborts before signature', async () => {
		setupHappyPath();
		// Pool drained — re-quote shares come out below intent.minShares.
		// With reserves halved, fresh shares math: amountA * total / reserveA
		// = 1_000_000 * 1_000_000_000 / 500_000_000 = 2_000_000.
		// minSharesB derivation using token-B side: 1_000_000 * 1_000_000_000
		// / 500_000_000 = 2_000_000 — both sides equal, fine.
		// To force a stale fail we drop totalLpShares so re-quote returns
		// a smaller minimum. amountA=1_000_000, total=10_000, reserveA=
		// 1_000_000_000 → sharesA = 10. That's < intent.minShares (990_000).
		mocks.parsePoolState.mockReturnValue({
			...FAKE_POOL,
			totalLpShares: 10_000n
		});

		await lpForm.startAdd(makeAddIntent());
		await settle();

		const a = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Price moved/);
		// No wallet prompt was made.
		expect(mocks.signAndSendTransaction).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('FA-8 90s confirm timeout: error phase with timeout message', async () => {
		setupHappyPath();
		// Polling path: status never reaches `confirmed`, block-height
		// stays valid — the wall-clock timer is what fires.
		mocks.getSignatureStatuses.mockResolvedValue({
			value: [{ confirmationStatus: 'processed', err: null, slot: 1 }]
		});
		mocks.getBlockHeight.mockResolvedValue(0);

		const promise = lpForm.startAdd(makeAddIntent());
		await settle();

		await vi.advanceTimersByTimeAsync(90_000);
		await promise;

		const a = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Still pending/);
	});

	it('FA-9 add rejects when amounts are zero', async () => {
		setupHappyPath();

		const intent = makeAddIntent();
		intent.amountA = 0n;

		await lpForm.startAdd(intent);
		await settle();

		const a = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/greater than zero/);
		expect(mocks.getAccountInfo).not.toHaveBeenCalled();
	});

	it('FA-10 mainnet placeholder RWT: error before any RPC for add', async () => {
		setupHappyPath();
		mocks.currentNetwork.mockReturnValue('mainnet');
		mocks.isPlaceholderRwtMint.mockReturnValue(true);

		await lpForm.startAdd(makeAddIntent());
		await settle();

		const a = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Mainnet RWT/);
		expect(mocks.getAccountInfo).not.toHaveBeenCalled();
	});

	it('FA-11 success refreshes lpStore + portfolio + balances', async () => {
		setupHappyPath();

		await lpForm.startAdd(makeAddIntent());
		await settle();

		expect(mocks.lpStoreRefresh).toHaveBeenCalledTimes(1);
		expect(mocks.portfolioRefresh).toHaveBeenCalledTimes(1);
		expect(mocks.balancesRefreshAll).toHaveBeenCalledTimes(1);
	});

	it('FA-12 isInFlight reflects in-flight only (not terminal)', async () => {
		setupHappyPath();
		// Hold the signature in `processed` (not yet `confirmed`) so the
		// FSM stays in `confirming` — switch to `confirmed` for the next
		// poll after we've asserted in-flight.
		let confirmed = false;
		mocks.getSignatureStatuses.mockImplementation(async () => ({
			value: [
				{
					confirmationStatus: confirmed ? 'confirmed' : 'processed',
					err: null,
					slot: 1
				}
			]
		}));
		mocks.getBlockHeight.mockResolvedValue(0);

		const promise = lpForm.startAdd(makeAddIntent());
		await settle();

		expect(lpForm.isInFlight(POOL_PDA_A)).toBe(true);

		confirmed = true;
		// Advance through the 1.5s poll interval so the next iteration sees
		// the `confirmed` status and resolves.
		await vi.advanceTimersByTimeAsync(1500);
		await settle();
		await promise;

		expect(lpForm.isInFlight(POOL_PDA_A)).toBe(false);
	});

	it('FA-13 concurrent starts for different pools run in parallel', async () => {
		setupHappyPath();

		const intentA = makeAddIntent();
		const intentB = makeAddIntent(makePoolRow(POOL_PDA_B));
		// Avoid mint collision in the test so the snapshot for B is distinct.
		intentB.pool.tokenBMint = SPRK_MINT;

		const p1 = lpForm.startAdd(intentA);
		const p2 = lpForm.startAdd(intentB);

		expect(lpForm.attempts.size).toBe(2);

		await settle();
		await Promise.all([p1, p2]);

		expect(mocks.buildAddLiquidityTx).toHaveBeenCalledTimes(2);
	});

	it('FA-14 auto-cleanup: terminal attempt dropped after 3s', async () => {
		setupHappyPath();

		await lpForm.startAdd(makeAddIntent());
		await settle();

		expect(lpForm.attempts.get(POOL_PDA_A.toBase58())?.phase).toBe('success');

		await vi.advanceTimersByTimeAsync(3_000);

		expect(lpForm.attempts.has(POOL_PDA_A.toBase58())).toBe(false);
	});

	it('FA-15 remove allows master pool (exit must always work)', async () => {
		setupHappyPath();
		mocks.isMasterPool.mockReturnValue(true);

		const intent = makeRemoveIntent(makePoolRow(POOL_PDA_A, true));
		await lpForm.startRemove(intent);
		await settle();

		const a = lpForm.attempts.get(POOL_PDA_A.toBase58());
		expect(a?.phase).toBe('success');
		expect(mocks.buildRemoveLiquidityTx).toHaveBeenCalledTimes(1);
	});
});
