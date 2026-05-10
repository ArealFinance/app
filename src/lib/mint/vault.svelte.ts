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

import { INITIAL_NAV, NAV_SCALE, parseRwtVault, type RwtVault } from '@areal/sdk/rwt-engine';
import { findRwtVaultPda } from '@areal/sdk/pda';

import { network } from '$lib/network/network.svelte';

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
 * mint. Mirrors `contracts/rwt-engine/src/nav.rs::calculate_nav` and the
 * SDK's `quoteMintRwt::calculateNav` exactly:
 *
 *   - supply == 0      → INITIAL_NAV (bootstrap, $1 par)
 *   - otherwise        → max(1, capital * NAV_SCALE / supply)
 *
 * The `NAV_SCALE` (1e6, matching RWT's 6 decimals) MUST be applied before
 * division, otherwise integer truncation collapses any reasonable book
 * value to 0/1 — e.g. a 1:1 vault (capital == supply, both 10^13 lamports)
 * would otherwise yield raw `1n` which formats as "$0.0000" in the
 * 6-decimal display path. See vault.svelte.ts callers (`liveNavDisplay`)
 * and the SDK's matching helper.
 */
function computeNav(v: RwtVault): bigint {
	if (v.totalRwtSupply === 0n) return INITIAL_NAV;
	// Same widening as Rust (`mul_div_u128_u64`). Result is fixed-point with
	// `NAV_SCALE` precision: 1.0 NAV → 1_000_000n.
	const raw = (v.totalInvestedCapital * NAV_SCALE) / v.totalRwtSupply;
	// Clamp matches the contract's NAV=0 prevention at extreme ratios.
	return raw === 0n ? 1n : raw;
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
