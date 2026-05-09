/*
 * Vault store unit tests.
 *
 * Phase 10 follow-up App 1: regression for the deactivate-while-pending
 * race. The vault store opens its WS subscription synchronously inside
 * `activate()` (before awaiting the RPC fetch), so a deactivate that
 * fires before the WS notification arrives must NOT let a late
 * notification mutate the rune-backed `vault` state. The capture-once
 * `Connection` invariant + the `activePdaBase58 !== pdaBase58` guard
 * inside the listener body together enforce this.
 *
 * Removing either guard would surface as: deactivate() returns, but a
 * subsequent on-chain push from the OLD Connection's listener writes
 * the parsed account back into `vault`, leaving the store in an
 * inconsistent active=null/vault!=null state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';

const VAULT_PDA = new PublicKey('11111111111111111111111111111114');
const PROGRAM_ID = new PublicKey('11111111111111111111111111111115');

const FAKE_VAULT_INITIAL = {
	totalInvestedCapital: 1_000_000n,
	totalRwtSupply: 1_000_000n,
	mintPaused: false,
	navBookValue: 1_000_000n
};

const mocks = vi.hoisted(() => ({
	parseRwtVault: vi.fn(),
	findRwtVaultPda: vi.fn(),
	getAccountInfo: vi.fn(),
	wsConn: {
		onAccountChange: vi.fn(),
		removeAccountChangeListener: vi.fn()
	},
	currentNetwork: 'devnet' as const
}));

vi.mock('@areal/sdk/rwt-engine', () => ({
	INITIAL_NAV: 1_000_000n,
	parseRwtVault: mocks.parseRwtVault
}));

vi.mock('@areal/sdk/pda', () => ({
	findRwtVaultPda: mocks.findRwtVaultPda
}));

vi.mock('$lib/network/network.svelte', () => ({
	network: {
		get current() {
			return mocks.currentNetwork;
		},
		get connection() {
			return { getAccountInfo: mocks.getAccountInfo };
		},
		get wsConnection() {
			return mocks.wsConn;
		},
		get endpoint() {
			return { programIds: { rwtEngine: PROGRAM_ID } };
		}
	}
}));

async function settle(times = 4) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('vaultStore', () => {
	let vaultStore: typeof import('./vault.svelte').vaultStore;

	beforeEach(async () => {
		mocks.parseRwtVault.mockReset();
		mocks.findRwtVaultPda.mockReset();
		mocks.getAccountInfo.mockReset();
		mocks.wsConn.onAccountChange.mockReset();
		mocks.wsConn.removeAccountChangeListener.mockReset();

		mocks.findRwtVaultPda.mockReturnValue([VAULT_PDA, 0]);
		mocks.parseRwtVault.mockReturnValue(FAKE_VAULT_INITIAL);
		// Start with a listener id that the store can later unregister.
		let nextId = 100;
		mocks.wsConn.onAccountChange.mockImplementation(() => nextId++);

		const mod = await import('./vault.svelte');
		vaultStore = mod.vaultStore;
		// Ensure a clean module-level state between tests.
		vaultStore.deactivate();
	});

	afterEach(() => {
		vaultStore.deactivate();
	});

	it('deactivate clears pending WS subscription mid-flight', async () => {
		// Stall the RPC fetch indefinitely so we can deactivate BEFORE it
		// resolves. This models the realistic race: activate() returns the
		// fetch promise, the user navigates away (deactivate fires), and
		// only afterwards does the cluster push a vault update through the
		// already-registered listener.
		// Hold the resolve callback so the test can drain the orphaned fetch
		// after the deactivate. Plain non-nullable function — TS flow analysis
		// across the Promise constructor closure boundary loses track of an
		// `(... | null)` assignment, which then narrows downstream `?.()`
		// invocation to `never`. We keep nullability via `assigned` flag.
		type ResolveFetch = (info: {
			data: Uint8Array;
			executable: false;
			lamports: 0;
			owner: PublicKey;
		}) => void;
		let resolveFetch: ResolveFetch = () => {};
		let resolveFetchAssigned = false;
		mocks.getAccountInfo.mockImplementation(
			() =>
				new Promise<{
					data: Uint8Array;
					executable: false;
					lamports: 0;
					owner: PublicKey;
				}>((resolve) => {
					resolveFetch = resolve;
					resolveFetchAssigned = true;
				})
		);

		const activatePromise = vaultStore.activate();
		// Let the synchronous portion of activate() run — listener is now
		// registered against `mocks.wsConn`.
		await settle();
		expect(mocks.wsConn.onAccountChange).toHaveBeenCalledTimes(1);
		const wsCallback = mocks.wsConn.onAccountChange.mock.calls[0][1];

		// Capture the listener id so we can verify the unregister target.
		const registeredId = mocks.wsConn.onAccountChange.mock.results[0].value;

		// User navigates away — deactivate fires before the WS push arrives.
		vaultStore.deactivate();

		// The teardown must reach removeAccountChangeListener with the SAME
		// id that onAccountChange returned, on the SAME Connection instance.
		// This is the "capture-once Connection" invariant — if the store
		// re-read `network.wsConnection` here it could legally return a
		// different object on each access; the cycle record pins the right one.
		expect(mocks.wsConn.removeAccountChangeListener).toHaveBeenCalledWith(registeredId);

		// Now simulate the late WS notification arriving on the (already
		// torn down) listener. The listener body's `activePdaBase58 !==
		// pdaBase58` guard must drop the update so it never reaches
		// parseRwtVault and never writes to `vault`.
		mocks.parseRwtVault.mockClear();
		const LATE_PUSH_DATA = new Uint8Array([9, 9, 9]);
		wsCallback({ data: LATE_PUSH_DATA });

		// Assertions:
		//   1. parseRwtVault was NOT called for the stale push — the guard
		//      ran before the parse.
		expect(mocks.parseRwtVault).not.toHaveBeenCalled();
		//   2. Public state remains null — no late write leaked through.
		expect(vaultStore.vault).toBeNull();
		expect(vaultStore.nav).toBeNull();

		// Drain the (now-orphaned) fetch so the test runner's afterAll
		// teardown isn't holding a dangling promise.
		if (resolveFetchAssigned) {
			resolveFetch({
				data: new Uint8Array([1]),
				executable: false,
				lamports: 0,
				owner: PROGRAM_ID
			});
		}
		await activatePromise;
		await settle();

		// Even after the fetch finally resolves, the late-response guard in
		// fetchVault (`activePdaBase58 !== expectedKey`) keeps the public
		// state null — no surprise mutation.
		expect(vaultStore.vault).toBeNull();
	});
});
