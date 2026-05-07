/*
 * Reactive RwtVault store — runes-based singleton for the mint form.
 *
 * Owns the singleton `RwtVault` PDA (one per RwtEngine deployment) plus the
 * WS subscription that re-fetches it on any vault state change. Drives the
 * NAV badge, the mint-paused empty state, and the live quote computation
 * (which depends on `totalInvestedCapital` + `totalRwtSupply`).
 *
 * Public surface:
 *   vaultStore.{vault, nav, mintPaused, totalSupply, totalCapital, isLoading,
 *               activate(), deactivate()}
 *
 * Critical correctness invariants (mirrors the markets pool-store contract):
 *
 *   1. SAME CONNECTION INSTANCE for `onAccountChange` register and
 *      `removeAccountChangeListener` unregister. The network store's
 *      `wsConnection` getter returns a *fresh* Connection per access — we
 *      capture it once per cycle and stash it on the cycle record.
 *
 *   2. NETWORK SWITCH tears down the previous cycle on the OLD Connection
 *      before opening a new one. Different RwtEngine program IDs per
 *      cluster also produce different vault PDAs.
 *
 *   3. LATE-RESPONSE GUARD. Active vault PDA can change while a
 *      `getAccountInfo` RPC is in flight. We track the PDA on each fetch
 *      and drop results that don't match.
 */
import type { Connection, PublicKey } from '@solana/web3.js';

import { parseRwtVault, type RwtVault } from '@areal/sdk/rwt-engine';
import { findRwtVaultPda } from '@areal/sdk/pda';

import { network } from '$lib/network/network.svelte';

/**
 * Initial NAV in lamports — mirrors `rwt-engine::constants::INITIAL_NAV`.
 * When `totalRwtSupply == 0` the vault has no priced backing yet, so the
 * UI shows 1.00 USDC per RWT (1e6 lamports of USDC, 6 decimals).
 *
 * Hardcoded here rather than imported because the SDK does not currently
 * expose the constant as a value (only as part of the quote helper). When
 * the SDK ships a `INITIAL_NAV` export, swap to it.
 */
const INITIAL_NAV: bigint = 1_000_000n;

let vault: RwtVault | null = $state(null);
let isLoading: boolean = $state(false);

interface SubscriptionCycle {
	wsConn: Connection;
	listenerId: number;
	pdaBase58: string;
}
let cycle: SubscriptionCycle | null = null;
let activePdaBase58: string | null = null;

/**
 * Compute the NAV used by the on-chain `mint_rwt::handler` to price a
 * mint. Mirrors `quoteMintRwt`'s internal calculation:
 *
 *   - supply == 0  → INITIAL_NAV (vault is empty, $1 par)
 *   - supply  > 0  → totalInvestedCapital / totalRwtSupply (book value)
 *
 * Returned as bigint (USDC lamports per RWT lamport) — caller scales for
 * display.
 */
function computeNav(v: RwtVault): bigint {
	if (v.totalRwtSupply === 0n) return INITIAL_NAV;
	// Book value: lamports-of-USDC per lamport-of-RWT. Both decimals are 6.
	// On-chain rounds down, we mirror that with bigint division.
	return v.totalInvestedCapital / v.totalRwtSupply;
}

function teardownCycle() {
	if (!cycle) return;
	const { wsConn, listenerId } = cycle;
	try {
		wsConn.removeAccountChangeListener(listenerId);
	} catch {
		/* noop — connection torn down or listener already gone */
	}
	cycle = null;
}

async function fetchVault(pda: PublicKey, conn: Connection): Promise<void> {
	const expectedKey = pda.toBase58();
	const info = await conn.getAccountInfo(pda);
	// Late-response guard.
	if (activePdaBase58 !== expectedKey) return;

	if (!info) {
		vault = null;
		isLoading = false;
		return;
	}
	try {
		vault = parseRwtVault(info.data);
	} catch {
		// Malformed account — treat as missing.
		vault = null;
	}
	isLoading = false;
}

function subscribeVault(pda: PublicKey) {
	teardownCycle();
	const wsConn = network.wsConnection;
	const pdaBase58 = pda.toBase58();

	const listenerId = wsConn.onAccountChange(pda, (acc) => {
		// Stale-cycle guard — a teardown can race with a pending notification.
		if (activePdaBase58 !== pdaBase58) return;
		try {
			vault = parseRwtVault(acc.data);
		} catch {
			// Malformed update — keep prior state, UI shows stale NAV.
		}
	});

	cycle = { wsConn, listenerId, pdaBase58 };
}

async function activate(): Promise<void> {
	const programId = network.endpoint.programIds.rwtEngine;
	const [pda] = findRwtVaultPda(programId);
	const newKey = pda.toBase58();

	if (activePdaBase58 === newKey) {
		// Already active for this PDA — no-op.
		return;
	}

	teardownCycle();
	activePdaBase58 = newKey;
	vault = null;
	isLoading = true;

	// Open the WS subscription before the RPC fetch so we don't miss an
	// account change between fetch resolution and listener registration.
	subscribeVault(pda);

	await fetchVault(pda, network.connection);
}

function deactivate() {
	teardownCycle();
	activePdaBase58 = null;
	vault = null;
	isLoading = false;
}

export const vaultStore = {
	get vault(): RwtVault | null {
		return vault;
	},
	get nav(): bigint | null {
		return vault === null ? null : computeNav(vault);
	},
	get mintPaused(): boolean {
		return vault?.mintPaused ?? false;
	},
	get totalSupply(): bigint | null {
		return vault?.totalRwtSupply ?? null;
	},
	get totalCapital(): bigint | null {
		return vault?.totalInvestedCapital ?? null;
	},
	get isLoading(): boolean {
		return isLoading;
	},
	activate,
	deactivate
};
