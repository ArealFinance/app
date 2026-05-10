/*
 * Reactive mint quote store — runes-based singleton for the mint form.
 *
 * Owns:
 *   - The user-facing input amount (USDC lamports) + slippage tolerance.
 *   - The debounced re-quote against the active `RwtVault`'s NAV.
 *
 * Public surface:
 *   mintQuote.{input, slippageBps, result,
 *              setInput(amount), setSlippage(bps), recompute()}
 *
 * Critical correctness invariants:
 *
 *   1. DEBOUNCED setInput. Multiple rapid keystrokes collapse to one
 *      `quoteMintRwt` call (200ms window).
 *
 *   2. SLIPPAGE CHANGES DON'T RECOMPUTE. The contract's pricing depends
 *      only on `(totalInvestedCapital, totalRwtSupply, amountIn)` —
 *      slippage is a UI-side floor on `min_rwt_out` derived via
 *      `applyMintSlippage(rwtOut, bps)` at the call site (see
 *      `routes/mint/+page.svelte`).
 *
 *   3. VAULT CHANGE TRIGGERS RECOMPUTE. The vault store's WS subscription
 *      mutates `vaultStore.vault` whenever the on-chain vault state
 *      changes. The page-level `$effect` in `+page.svelte` watches the
 *      vault rune and calls `mintQuote.recompute()` so the quote stays
 *      priced against the current NAV. We deliberately do NOT wire a
 *      module-level `$effect.root` here — debugging an effect that fires
 *      from outside any component context is a nightmare, and the page
 *      already owns the lifetime of the form, so the wiring belongs there.
 *
 *   4. CLAMP SLIPPAGE to the shared [SLIPPAGE_MIN_BPS, SLIPPAGE_MAX_BPS]
 *      window — the same one the swap module uses.
 */
import {
	quoteMintRwt,
	type MintQuoteOutcome
} from '@areal/sdk/rwt-engine';
import { RWT_MINTS, type ClusterName } from '@areal/sdk/network';

import { network } from '$lib/network/network.svelte';
import type { NetworkId } from '$lib/network/endpoints';
import { vaultStore } from './vault.svelte';
import {
	SLIPPAGE_DEFAULT_BPS,
	SLIPPAGE_MAX_BPS,
	SLIPPAGE_MIN_BPS
} from './constants';

/** Recompute window after the last `setInput` keystroke. */
const RECOMPUTE_DEBOUNCE_MS = 200;

let input: bigint = $state(0n);
let slippageBps: number = $state(SLIPPAGE_DEFAULT_BPS);
let result: MintQuoteOutcome | null = $state(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function toCluster(id: NetworkId): ClusterName {
	return id as ClusterName;
}

function clearDebounce() {
	if (debounceTimer !== null) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
}

function recomputeQuote() {
	const vault = vaultStore.vault;
	if (!vault) {
		result = null;
		return;
	}
	if (input === 0n) {
		result = null;
		return;
	}
	const cluster = toCluster(network.current);
	// Override-aware (Testnet): `network.rwtMint` falls back to RWT_MINTS[cluster]
	// for devnet/mainnet but uses `endpoint.rwtMint` on the Areal Testnet
	// validator where bootstrap-init.ts created a non-canonical mint.
	const rwtMint = network.rwtMint;

	result = quoteMintRwt({
		vault,
		amountIn: input,
		cluster,
		rwtMint
	});
}

function scheduleRecompute() {
	clearDebounce();
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		recomputeQuote();
	}, RECOMPUTE_DEBOUNCE_MS);
}

function setInput(amount: bigint) {
	input = amount;
	scheduleRecompute();
}

function setSlippage(bps: number) {
	if (!Number.isFinite(bps)) return;
	const clamped = Math.max(SLIPPAGE_MIN_BPS, Math.min(SLIPPAGE_MAX_BPS, Math.round(bps)));
	slippageBps = clamped;
	// No recompute — `applyMintSlippage(rwtOut, bps)` runs at the call
	// site. The quote depends only on `(amountIn, vault state)`.
}

/**
 * Force-immediate recompute against the current vault snapshot. Used by
 * the page-level `$effect` that watches `vaultStore.vault` — when the
 * upstream vault mutates (WS push) or the network flips, the page calls
 * this to bypass the typing-debounce. Safe to call multiple times in a
 * row; idempotent against the current `(input, vault)` pair.
 */
function recompute() {
	clearDebounce();
	recomputeQuote();
}

export const mintQuote = {
	get input(): bigint {
		return input;
	},
	get slippageBps(): number {
		return slippageBps;
	},
	get result(): MintQuoteOutcome | null {
		return result;
	},
	setInput,
	setSlippage,
	recompute
};
