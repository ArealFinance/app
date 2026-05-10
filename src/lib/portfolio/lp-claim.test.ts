/*
 * LP-fees claim service unit tests.
 *
 * Mirror of `claim.test.ts`. Covers the FSM phases, single-flight per
 * position, user-rejection silent revert, 90s confirm timeout, and the
 * nothing-to-claim pre-flight short-circuit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const POSITION_A = new PublicKey('11111111111111111111111111111114');
const POSITION_B = new PublicKey('11111111111111111111111111111115');
const POOL_A = new PublicKey('11111111111111111111111111111116');
const POOL_B = new PublicKey('11111111111111111111111111111117');
const HOLDER = new PublicKey('11111111111111111111111111111112');
const TOKEN_A_MINT = new PublicKey('11111111111111111111111111111118');
const TOKEN_B_MINT = new PublicKey('11111111111111111111111111111119');
const VAULT_A = new PublicKey('1111111111111111111111111111111A');
const VAULT_B = new PublicKey('1111111111111111111111111111111B');
const ATA_A = new PublicKey('1111111111111111111111111111111C');
const ATA_B = new PublicKey('1111111111111111111111111111111D');
const OT_TREASURY_DEST = new PublicKey('1111111111111111111111111111111E');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('1111111111111111111111111111111F'),
	yieldDistribution: new PublicKey('1111111111111111111111111111111G'),
	rwtEngine: new PublicKey('1111111111111111111111111111111H'),
	nativeDex: new PublicKey('1111111111111111111111111111111J'),
	futarchy: new PublicKey('1111111111111111111111111111111K')
};

const mocks = vi.hoisted(() => ({
	buildClaimLpFeesTx: vi.fn(),
	findAssociatedTokenAddressPda: vi.fn(),
	signAndSendTransaction: vi.fn(),
	getLatestBlockhash: vi.fn(),
	confirmTransaction: vi.fn(),
	lpPortfolioRefresh: vi.fn(),
	toastWarning: vi.fn(),
	toastError: vi.fn(),
	showError: vi.fn()
}));

vi.mock('@areal/sdk/tx', () => ({
	buildClaimLpFeesTx: mocks.buildClaimLpFeesTx
}));

vi.mock('@areal/sdk/pda', () => ({
	findAssociatedTokenAddressPda: mocks.findAssociatedTokenAddressPda
}));

vi.mock('$lib/stores/wallet.svelte', () => ({
	wallet: {
		get publicKey() {
			return walletState.publicKey;
		},
		signAndSendTransaction: mocks.signAndSendTransaction
	}
}));

const walletState = { publicKey: HOLDER as PublicKey | null };

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return 'devnet';
		},
		get connection() {
			return {
				getLatestBlockhash: mocks.getLatestBlockhash,
				confirmTransaction: mocks.confirmTransaction
			};
		},
		get endpoint() {
			return { programIds: PROGRAM_IDS };
		}
	}
}));

vi.mock('$lib/portfolio/lp-portfolio-store.svelte', () => ({
	lpPortfolio: {
		refresh: mocks.lpPortfolioRefresh
	}
}));

vi.mock('$lib/errors', () => ({
	showError: mocks.showError
}));

vi.mock('$lib/components/ui', () => ({
	toast: {
		warning: mocks.toastWarning,
		error: mocks.toastError
	}
}));

// --------------------------------------------------------------------------
// Test fixtures
// --------------------------------------------------------------------------

function makeRow(opts: {
	positionAddress?: PublicKey;
	poolAddress?: PublicKey;
	cumulativeFeesPerShareA?: bigint;
	cumulativeFeesPerShareB?: bigint;
	feesClaimedPerShareA?: bigint;
	feesClaimedPerShareB?: bigint;
} = {}) {
	const positionAddress = opts.positionAddress ?? POSITION_A;
	const poolAddress = opts.poolAddress ?? POOL_A;
	return {
		positionAddress,
		position: {
			pool: poolAddress,
			owner: HOLDER,
			shares: 1000n,
			lastUpdateTs: 0n,
			bump: 255,
			feesClaimedPerShareA: opts.feesClaimedPerShareA ?? 0n,
			feesClaimedPerShareB: opts.feesClaimedPerShareB ?? 0n
		},
		pool: {
			poolType: 0,
			tokenAMint: TOKEN_A_MINT,
			tokenBMint: TOKEN_B_MINT,
			vaultA: VAULT_A,
			vaultB: VAULT_B,
			reserveA: 100n,
			reserveB: 100n,
			totalLpShares: 100n,
			feeBps: 30,
			isActive: true,
			totalFeesAccumulated: 0n,
			binStepBps: 0,
			activeBinId: 0,
			otTreasuryFeeDestination: OT_TREASURY_DEST,
			hasOtTreasury: false,
			bump: 255,
			cumulativeFeesPerShareA: opts.cumulativeFeesPerShareA ?? 100n,
			cumulativeFeesPerShareB: opts.cumulativeFeesPerShareB ?? 200n
		},
		poolAddress,
		symbolA: 'A',
		symbolB: 'B',
		decimalsA: 6,
		decimalsB: 6,
		valuation: {
			amountA: 100n,
			amountB: 100n,
			usdcA: 100,
			usdcB: 100,
			totalUsdc: 200,
			pctA: 0.5,
			pctB: 0.5,
			ratioA: 0.5
		},
		isEmpty: false
	};
}

async function settle(times = 6) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function setupHappyPathMocks() {
	mocks.findAssociatedTokenAddressPda.mockImplementation(
		(_owner: PublicKey, mint: PublicKey): [PublicKey, number] => {
			if (mint.equals(TOKEN_A_MINT)) return [ATA_A, 255];
			return [ATA_B, 255];
		}
	);
	mocks.buildClaimLpFeesTx.mockResolvedValue({});
	mocks.getLatestBlockhash.mockResolvedValue({
		blockhash: 'BLOCKHASH',
		lastValidBlockHeight: 12345
	});
	mocks.signAndSendTransaction.mockResolvedValue({ signature: 'SIG_OK' });
	mocks.confirmTransaction.mockResolvedValue({ value: { err: null } });
}

// --------------------------------------------------------------------------
// Suite
// --------------------------------------------------------------------------

describe('lp-claims service', () => {
	let lpClaims: typeof import('./lp-claim.svelte').lpClaims;

	beforeEach(async () => {
		vi.useFakeTimers();
		Object.values(mocks).forEach((m) => {
			if (typeof (m as { mockReset?: () => void }).mockReset === 'function') {
				(m as { mockReset: () => void }).mockReset();
			}
		});
		walletState.publicKey = HOLDER;

		const mod = await import('./lp-claim.svelte');
		lpClaims = mod.lpClaims;
		// Drop residual attempts from a previous test.
		(lpClaims.attempts as unknown as Map<string, unknown>).clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('happy path: progresses through phases to success and refreshes portfolio', async () => {
		setupHappyPathMocks();

		const row = makeRow();
		const promise = lpClaims.start(row);

		// `preparing` is set synchronously.
		expect(lpClaims.attempts.get(POSITION_A.toBase58())?.phase).toBe('preparing');

		await settle();
		await promise;

		const final = lpClaims.attempts.get(POSITION_A.toBase58());
		expect(final?.phase).toBe('success');
		expect(final?.signature).toBe('SIG_OK');
		expect(mocks.lpPortfolioRefresh).toHaveBeenCalledTimes(1);
	});

	it('build call passes correct account context', async () => {
		setupHappyPathMocks();

		await lpClaims.start(makeRow());
		await settle();

		expect(mocks.buildClaimLpFeesTx).toHaveBeenCalledTimes(1);
		const args = mocks.buildClaimLpFeesTx.mock.calls[0][0];
		expect(args.ctx.dexProgramId).toBe(PROGRAM_IDS.nativeDex);
		expect(args.ctx.recipient).toBe(HOLDER);
		expect(args.ctx.pool).toBe(POOL_A);
		expect(args.ctx.lpPosition).toBe(POSITION_A);
		expect(args.ctx.poolVaultA).toBe(VAULT_A);
		expect(args.ctx.poolVaultB).toBe(VAULT_B);
		expect(args.ctx.recipientTokenAAta).toBe(ATA_A);
		expect(args.ctx.recipientTokenBAta).toBe(ATA_B);
		expect(args.ensureRecipientAtas).toBe(true);
		expect(args.tokenAMint).toBe(TOKEN_A_MINT);
		expect(args.tokenBMint).toBe(TOKEN_B_MINT);
	});

	it('user rejection (string): drops attempt silently without showing error', async () => {
		setupHappyPathMocks();
		mocks.signAndSendTransaction.mockRejectedValue(new Error('User rejected the request'));

		await lpClaims.start(makeRow());
		await settle();

		expect(lpClaims.attempts.get(POSITION_A.toBase58())).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('user rejection by code 4001 also drops silently', async () => {
		setupHappyPathMocks();
		mocks.signAndSendTransaction.mockRejectedValue({ code: 4001, message: 'cancelled' });

		await lpClaims.start(makeRow());
		await settle();

		expect(lpClaims.attempts.get(POSITION_A.toBase58())).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
	});

	it('sign error (other): error phase via showError', async () => {
		setupHappyPathMocks();
		mocks.signAndSendTransaction.mockRejectedValue(new Error('rpc 502'));

		await lpClaims.start(makeRow());
		await settle();

		const a = lpClaims.attempts.get(POSITION_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.showError).toHaveBeenCalledTimes(1);
		expect(mocks.showError).toHaveBeenCalledWith(expect.any(Error), PROGRAM_IDS.nativeDex);
	});

	it('confirmTx returns err: error phase + showError called', async () => {
		setupHappyPathMocks();
		mocks.confirmTransaction.mockResolvedValue({
			value: { err: { InstructionError: [0, { Custom: 6042 }] } }
		});

		await lpClaims.start(makeRow());
		await settle();

		const a = lpClaims.attempts.get(POSITION_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.showError).toHaveBeenCalledTimes(1);
	});

	it('90s confirm timeout: error phase with timeout message', async () => {
		setupHappyPathMocks();
		mocks.confirmTransaction.mockReturnValue(new Promise(() => {}));

		const promise = lpClaims.start(makeRow());
		await settle();

		await vi.advanceTimersByTimeAsync(90_000);
		await promise;

		const a = lpClaims.attempts.get(POSITION_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Still pending/);
	});

	it('single-flight: duplicate start for same position is a no-op', async () => {
		setupHappyPathMocks();

		const row = makeRow();
		const p1 = lpClaims.start(row);
		const p2 = lpClaims.start(row);

		await settle();
		await Promise.all([p1, p2]);

		// Only one buildClaimLpFeesTx call → second start was dropped.
		expect(mocks.buildClaimLpFeesTx).toHaveBeenCalledTimes(1);
	});

	it('concurrent claims for different positions run in parallel', async () => {
		setupHappyPathMocks();

		const rowA = makeRow({ positionAddress: POSITION_A, poolAddress: POOL_A });
		const rowB = makeRow({ positionAddress: POSITION_B, poolAddress: POOL_B });

		const p1 = lpClaims.start(rowA);
		const p2 = lpClaims.start(rowB);

		expect(lpClaims.attempts.size).toBe(2);

		await settle();
		await Promise.all([p1, p2]);

		expect(mocks.buildClaimLpFeesTx).toHaveBeenCalledTimes(2);
	});

	it('null row: silently no-ops without FSM entry or side effects', async () => {
		setupHappyPathMocks();

		// `start(null)` guards against the render→click race where
		// `selectedLpRow` is nulled between template guard and click handler.
		await lpClaims.start(null);
		await settle();

		expect(lpClaims.attempts.size).toBe(0);
		expect(mocks.buildClaimLpFeesTx).not.toHaveBeenCalled();
		expect(mocks.toastWarning).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.showError).not.toHaveBeenCalled();
	});

	it('nothing-to-claim pre-flight: warns + returns without FSM entry', async () => {
		const row = makeRow({
			cumulativeFeesPerShareA: 100n,
			cumulativeFeesPerShareB: 200n,
			feesClaimedPerShareA: 100n,
			feesClaimedPerShareB: 200n
		});

		await lpClaims.start(row);
		await settle();

		expect(lpClaims.attempts.size).toBe(0);
		expect(mocks.toastWarning).toHaveBeenCalled();
		expect(mocks.buildClaimLpFeesTx).not.toHaveBeenCalled();
	});

	it('auto-cleanup: terminal attempts dropped after 3s', async () => {
		setupHappyPathMocks();

		await lpClaims.start(makeRow());
		await settle();

		expect(lpClaims.attempts.get(POSITION_A.toBase58())?.phase).toBe('success');

		await vi.advanceTimersByTimeAsync(3_000);

		expect(lpClaims.attempts.has(POSITION_A.toBase58())).toBe(false);
	});

	it('wallet disconnected at start: error phase + toast', async () => {
		setupHappyPathMocks();
		walletState.publicKey = null;

		await lpClaims.start(makeRow());
		await settle();

		const a = lpClaims.attempts.get(POSITION_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('isInFlight reflects in-flight attempts only (not terminal ones)', async () => {
		setupHappyPathMocks();
		let confirmResolve: (v: unknown) => void = () => {};
		mocks.confirmTransaction.mockReturnValue(
			new Promise((resolve) => {
				confirmResolve = resolve;
			})
		);

		const promise = lpClaims.start(makeRow());
		await settle();

		expect(lpClaims.isInFlight(POSITION_A)).toBe(true);

		confirmResolve({ value: { err: null } });
		await settle();
		await promise;

		expect(lpClaims.isInFlight(POSITION_A)).toBe(false);
	});
});
