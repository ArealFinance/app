/*
 * Claims service unit tests.
 *
 * Strategy: mock the SDK + wallet + network singletons. The claims store
 * is a runes singleton imported once; tests reset state between cases by
 * letting terminal cleanup timers run (vi.useFakeTimers + advance) and by
 * ensuring no residual attempt blocks single-flight checks.
 *
 * Coverage targets (per Phase 7 plan):
 *   1. Happy path — wallet returns sig, confirmTx resolves
 *   2. User rejects — silent revert, no toast
 *   3. Proof not found
 *   4. Distributor account missing
 *   5. InvalidProof on confirmTx (Anchor mapped)
 *   6. SystemPaused (Anchor mapped)
 *   7. ExceedsMaxClaim (Anchor mapped)
 *   8. RPC timeout (90s)
 *   9. Single-flight (duplicate start same OT)
 *  10. Concurrent different OTs
 *  11. claimableNow === 0 / null
 *  12. Auto-cleanup after 3s
 *  13. portfolio.refresh() called on success
 *  14. Wallet disconnect mid-flow
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const OT_MINT_A = new PublicKey('11111111111111111111111111111117');
const OT_MINT_B = new PublicKey('1111111111111111111111111111111B');
const DISTRIBUTOR_A = new PublicKey('11111111111111111111111111111116');
const DISTRIBUTOR_B = new PublicKey('1111111111111111111111111111111C');
const ATA_A = new PublicKey('11111111111111111111111111111114');
const HOLDER = new PublicKey('11111111111111111111111111111112');
const REWARD_VAULT = new PublicKey('11111111111111111111111111111115');

const PROGRAM_IDS = {
	ownershipToken: new PublicKey('11111111111111111111111111111118'),
	yieldDistribution: new PublicKey('11111111111111111111111111111119'),
	rwtEngine: new PublicKey('1111111111111111111111111111111A'),
	nativeDex: new PublicKey('1111111111111111111111111111111D'),
	futarchy: new PublicKey('1111111111111111111111111111111E')
};

const RWT_MINT_DEVNET = new PublicKey('6YRfYtkZmqWgz8N3MDeqJRc4vSiJ5VGgiMv4ihYzJyY4');

// --------------------------------------------------------------------------
// Hoisted mocks
// --------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
	buildClaimTx: vi.fn(),
	fetchMerkleProof: vi.fn(),
	parseMerkleDistributor: vi.fn(),
	signAndSendTransaction: vi.fn(),
	getAccountInfo: vi.fn(),
	getLatestBlockhash: vi.fn(),
	confirmTransaction: vi.fn(),
	portfolioRefresh: vi.fn(),
	toastWarning: vi.fn(),
	toastError: vi.fn(),
	showError: vi.fn()
}));

vi.mock('@areal/sdk/tx', () => ({
	buildClaimTx: mocks.buildClaimTx
}));

vi.mock('@areal/sdk/portfolio', () => ({
	fetchMerkleProof: mocks.fetchMerkleProof
}));

vi.mock('@areal/sdk/yield-distribution', () => ({
	parseMerkleDistributor: mocks.parseMerkleDistributor
}));

vi.mock('@areal/sdk/network', () => ({
	RWT_MINTS: {
		localnet: RWT_MINT_DEVNET,
		devnet: RWT_MINT_DEVNET,
		mainnet: RWT_MINT_DEVNET
	}
}));

vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_PROOF_STORE_URL: 'https://test-proof-store.example' }
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

function makeRow(
	otMint: PublicKey = OT_MINT_A,
	distributor: PublicKey | null = DISTRIBUTOR_A
) {
	return {
		otMint,
		metadata: { name: 'Test', symbol: 'T', decimals: 6 },
		balance: 1_000_000n,
		distributor,
		cumulativeAmount: 100n as bigint | null,
		claimedAmount: 30n,
		claimableNow: 70n as bigint | null,
		vestingRatePerSec: 0n as bigint | null,
		ataAddress: ATA_A
	};
}

function makeProof(overrides: Partial<{ cumulativeAmount: string; proof: string[] }> = {}) {
	return {
		distributor: DISTRIBUTOR_A.toBase58(),
		epoch: 1,
		holder: HOLDER.toBase58(),
		cumulativeAmount: overrides.cumulativeAmount ?? '100',
		proof: overrides.proof ?? [],
		merkleRoot: '00'.repeat(32),
		publishedAt: Date.now()
	};
}

const distributorAccountInfo = {
	data: new Uint8Array([1, 2, 3]),
	executable: false,
	lamports: 0,
	owner: PROGRAM_IDS.yieldDistribution
};

const fakeMerkleDistributor = {
	rewardVault: REWARD_VAULT
};

async function settle(times = 6) {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
}

function setupHappyPathMocks() {
	mocks.fetchMerkleProof.mockResolvedValue(makeProof());
	mocks.getAccountInfo.mockResolvedValue(distributorAccountInfo);
	mocks.parseMerkleDistributor.mockReturnValue(fakeMerkleDistributor);
	mocks.buildClaimTx.mockResolvedValue({});
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

describe('claims service', () => {
	let claims: typeof import('./claim.svelte').claims;

	beforeEach(async () => {
		vi.useFakeTimers();
		// Reset all mock fns + state.
		Object.values(mocks).forEach((m) => {
			if (typeof (m as { mockReset?: () => void }).mockReset === 'function') {
				(m as { mockReset: () => void }).mockReset();
			}
		});
		walletState.publicKey = HOLDER;

		const mod = await import('./claim.svelte');
		claims = mod.claims;
		// Drop any residual attempts from a previous test by advancing past
		// the auto-cleanup window. Cast the readonly Map to mutable for
		// the test-only forced reset path.
		(claims.attempts as unknown as Map<string, unknown>).clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('happy path: progresses through phases to success and refreshes portfolio', async () => {
		setupHappyPathMocks();

		const row = makeRow();
		const promise = claims.start(row);

		// `preparing` is set synchronously.
		expect(claims.attempts.get(OT_MINT_A.toBase58())?.phase).toBe('preparing');

		await settle();
		await promise;

		const final = claims.attempts.get(OT_MINT_A.toBase58());
		expect(final?.phase).toBe('success');
		expect(final?.signature).toBe('SIG_OK');
		expect(mocks.portfolioRefresh).toHaveBeenCalledTimes(1);
	});

	it('user rejection: drops attempt silently without showing error', async () => {
		setupHappyPathMocks();
		mocks.signAndSendTransaction.mockRejectedValue(new Error('User rejected the request'));

		await claims.start(makeRow());
		await settle();

		expect(claims.attempts.get(OT_MINT_A.toBase58())).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});

	it('user rejection by code 4001 also drops silently', async () => {
		setupHappyPathMocks();
		// Some wallet providers emit `{ code: 4001 }` without an Error.
		mocks.signAndSendTransaction.mockRejectedValue({ code: 4001, message: 'cancelled' });

		await claims.start(makeRow());
		await settle();

		expect(claims.attempts.get(OT_MINT_A.toBase58())).toBeUndefined();
		expect(mocks.showError).not.toHaveBeenCalled();
	});

	it('proof not found: surfaces error toast + error phase', async () => {
		mocks.fetchMerkleProof.mockResolvedValue(null);
		mocks.getAccountInfo.mockResolvedValue(distributorAccountInfo);

		await claims.start(makeRow());
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Proof not yet published/);
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('distributor account missing: error phase + toast', async () => {
		mocks.fetchMerkleProof.mockResolvedValue(makeProof());
		mocks.getAccountInfo.mockResolvedValue(null);

		await claims.start(makeRow());
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Distributor account not found/);
	});

	it('confirmTx returns err: error phase + showError called', async () => {
		setupHappyPathMocks();
		// InvalidProof = 6006 in YD program — surface via Anchor decode.
		mocks.confirmTransaction.mockResolvedValue({
			value: { err: { InstructionError: [0, { Custom: 6006 }] } }
		});

		await claims.start(makeRow());
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.showError).toHaveBeenCalledTimes(1);
		// showError received the program id so it can map Anchor codes.
		expect(mocks.showError).toHaveBeenCalledWith(
			expect.any(Error),
			PROGRAM_IDS.yieldDistribution
		);
	});

	it('confirmTx with SystemPaused (6002) flows through error path', async () => {
		setupHappyPathMocks();
		mocks.confirmTransaction.mockResolvedValue({
			value: { err: { InstructionError: [0, { Custom: 6002 }] } }
		});

		await claims.start(makeRow());
		await settle();

		expect(claims.attempts.get(OT_MINT_A.toBase58())?.phase).toBe('error');
		expect(mocks.showError).toHaveBeenCalled();
	});

	it('confirmTx with ExceedsMaxClaim (6010) flows through error path', async () => {
		setupHappyPathMocks();
		mocks.confirmTransaction.mockResolvedValue({
			value: { err: { InstructionError: [0, { Custom: 6010 }] } }
		});

		await claims.start(makeRow());
		await settle();

		expect(claims.attempts.get(OT_MINT_A.toBase58())?.phase).toBe('error');
	});

	it('90s confirm timeout: error phase with timeout message', async () => {
		setupHappyPathMocks();
		// confirmTransaction never resolves — the 90s race wins.
		mocks.confirmTransaction.mockReturnValue(new Promise(() => {}));

		const promise = claims.start(makeRow());
		await settle();

		// Advance past the 90s timeout window.
		await vi.advanceTimersByTimeAsync(90_000);
		await promise;

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/Still pending/);
	});

	it('single-flight: duplicate start for same OT is a no-op', async () => {
		setupHappyPathMocks();

		const row = makeRow();
		const p1 = claims.start(row);
		// Second call before the first finishes — should be ignored.
		const p2 = claims.start(row);

		await settle();
		await Promise.all([p1, p2]);

		// Only one fetchMerkleProof call → second start was dropped.
		expect(mocks.fetchMerkleProof).toHaveBeenCalledTimes(1);
	});

	it('concurrent claims for different OTs run in parallel', async () => {
		setupHappyPathMocks();

		const rowA = makeRow(OT_MINT_A, DISTRIBUTOR_A);
		const rowB = makeRow(OT_MINT_B, DISTRIBUTOR_B);

		const p1 = claims.start(rowA);
		const p2 = claims.start(rowB);

		expect(claims.attempts.size).toBe(2);

		await settle();
		await Promise.all([p1, p2]);

		expect(mocks.fetchMerkleProof).toHaveBeenCalledTimes(2);
	});

	it('claimableNow === 0n: pre-flight rejects with warning toast, no attempt', async () => {
		const row = makeRow();
		row.claimableNow = 0n;

		await claims.start(row);
		await settle();

		expect(claims.attempts.size).toBe(0);
		expect(mocks.toastWarning).toHaveBeenCalled();
		expect(mocks.fetchMerkleProof).not.toHaveBeenCalled();
	});

	it('claimableNow === null: pre-flight rejects', async () => {
		const row = makeRow();
		row.claimableNow = null;

		await claims.start(row);
		await settle();

		expect(claims.attempts.size).toBe(0);
		expect(mocks.fetchMerkleProof).not.toHaveBeenCalled();
	});

	it('null distributor: error phase + toast, no SDK calls', async () => {
		const row = makeRow(OT_MINT_A, null);

		await claims.start(row);
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.toastError).toHaveBeenCalled();
		expect(mocks.fetchMerkleProof).not.toHaveBeenCalled();
	});

	it('auto-cleanup: terminal attempts dropped after 3s', async () => {
		setupHappyPathMocks();

		await claims.start(makeRow());
		await settle();

		expect(claims.attempts.get(OT_MINT_A.toBase58())?.phase).toBe('success');

		await vi.advanceTimersByTimeAsync(3_000);

		expect(claims.attempts.has(OT_MINT_A.toBase58())).toBe(false);
	});

	it('wallet disconnected at start: error phase + toast', async () => {
		setupHappyPathMocks();
		walletState.publicKey = null;

		await claims.start(makeRow());
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(mocks.toastError).toHaveBeenCalled();
	});

	it('malformed proof.cumulativeAmount: error phase, no tx built', async () => {
		mocks.fetchMerkleProof.mockResolvedValue(makeProof({ cumulativeAmount: 'not-a-number' }));
		mocks.getAccountInfo.mockResolvedValue(distributorAccountInfo);
		mocks.parseMerkleDistributor.mockReturnValue(fakeMerkleDistributor);

		await claims.start(makeRow());
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toMatch(/malformed/);
		expect(mocks.buildClaimTx).not.toHaveBeenCalled();
	});

	it('malformed proof.proof: not an array fails fast', async () => {
		mocks.fetchMerkleProof.mockResolvedValue({
			...makeProof(),
			proof: 'not-an-array' as unknown as string[]
		});
		mocks.getAccountInfo.mockResolvedValue(distributorAccountInfo);
		mocks.parseMerkleDistributor.mockReturnValue(fakeMerkleDistributor);

		await claims.start(makeRow());
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toBe('Proof structure is malformed.');
		expect(mocks.buildClaimTx).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(3_000);
		expect(claims.attempts.has(OT_MINT_A.toBase58())).toBe(false);
	});

	it('malformed proof.proof: array with non-string element fails fast', async () => {
		mocks.fetchMerkleProof.mockResolvedValue({
			...makeProof(),
			proof: ['valid', 123 as unknown as string, 'valid']
		});
		mocks.getAccountInfo.mockResolvedValue(distributorAccountInfo);
		mocks.parseMerkleDistributor.mockReturnValue(fakeMerkleDistributor);

		await claims.start(makeRow());
		await settle();

		const a = claims.attempts.get(OT_MINT_A.toBase58());
		expect(a?.phase).toBe('error');
		expect(a?.error).toBe('Proof structure is malformed.');
		expect(mocks.buildClaimTx).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(3_000);
		expect(claims.attempts.has(OT_MINT_A.toBase58())).toBe(false);
	});

	it('isInFlight reflects in-flight attempts only (not terminal ones)', async () => {
		setupHappyPathMocks();
		// Hold confirmTransaction so we can sample isInFlight mid-flow.
		let confirmResolve: (v: unknown) => void = () => {};
		mocks.confirmTransaction.mockReturnValue(
			new Promise((resolve) => {
				confirmResolve = resolve;
			})
		);

		const promise = claims.start(makeRow());
		await settle();

		expect(claims.isInFlight(OT_MINT_A)).toBe(true);

		confirmResolve({ value: { err: null } });
		await settle();
		await promise;

		expect(claims.isInFlight(OT_MINT_A)).toBe(false);
	});
});
