/*
 * Testnet faucet client — runes-based singleton.
 *
 * Single responsibility: drive `POST /faucet/<token>` round-trips and turn
 * each well-known response shape into a toast + optional balance refresh.
 *
 * Two tokens are supported (USDC + RWT). They share the same response
 * contract and single-flight semantics, only the URL, claim amount, and
 * post-success balance refresh differ. The generic `runClaim()` helper
 * captures that shape; per-kind config lives in `KIND_CONFIG`.
 *
 * Status codes we care about (per `kind`):
 *   - 200          → success toast with truncated tx signature, refresh balance.
 *   - 429          → cooldown info toast formatted from `retryAfterSec`.
 *   - other non-OK → error toast surfacing the backend `message` (or fallback).
 *
 * Single-flight: each kind has its own `inFlight` rune so claiming USDC
 * never blocks an RWT click (and vice-versa). While a request is in-flight
 * for a given kind, additional calls for that same kind are no-ops.
 */
import { apiFetch } from '$lib/sdk/api-fetch';
import { network } from '$lib/network/network.svelte';
import { userBalances } from '$lib/swap/balances.svelte';
import { toast } from '$lib/components/ui';

interface FaucetSuccess {
	signature: string;
}

interface FaucetCooldown {
	retryAfterSec: number;
}

interface FaucetError {
	message?: string;
}

type FaucetKind = 'usdc' | 'rwt';

interface KindConfig {
	/** Endpoint path appended to `network.endpoint.backendApiUrl`. */
	path: string;
	/** Display amount used in the success toast (label-only, backend owns the real amount). */
	amountLabel: string;
	/** Token symbol shown in toasts. */
	symbol: string;
	/** Balance refresher fired after a successful claim. */
	refresh: () => Promise<void>;
}

const KIND_CONFIG: Record<FaucetKind, KindConfig> = {
	usdc: {
		path: '/faucet/usdc',
		amountLabel: '1000',
		symbol: 'USDC',
		// Refresh everything tracked (USDC + RWT + any per-mint chips) so the
		// /mint Pay row chip flips from 0 → 1000 USDC and the faucet button
		// can re-evaluate visibility.
		refresh: () => userBalances.refreshAll()
	},
	rwt: {
		path: '/faucet/rwt',
		amountLabel: '100',
		symbol: 'RWT',
		// RWT-only refresh would be enough for the Receive chip, but
		// refreshAll() keeps the post-claim view consistent (and matches the
		// USDC card behaviour) without any measurable cost — same one
		// `getTokenAccountBalance` round-trip per tracked mint.
		refresh: () => userBalances.refreshAll()
	}
};

let usdcInFlight: boolean = $state(false);
let rwtInFlight: boolean = $state(false);

function isInFlight(kind: FaucetKind): boolean {
	return kind === 'usdc' ? usdcInFlight : rwtInFlight;
}

function setInFlight(kind: FaucetKind, value: boolean): void {
	if (kind === 'usdc') usdcInFlight = value;
	else rwtInFlight = value;
}

/** "in 1h 0m" / "in 0h 10m" — minutes are rounded, hours floored. */
function formatRetryAfter(seconds: number): string {
	const safe = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(safe / 3600);
	const minutes = Math.round((safe % 3600) / 60);
	return `in ${hours}h ${minutes}m`;
}

/** "abcd…wxyz" — 4 chars on each side, like the wallet address chip. */
function truncateSignature(sig: string): string {
	if (sig.length <= 10) return sig;
	return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

async function runClaim(kind: FaucetKind, wallet: string): Promise<void> {
	if (isInFlight(kind)) return;
	setInFlight(kind, true);
	const cfg = KIND_CONFIG[kind];
	try {
		const baseUrl = network.endpoint.backendApiUrl;
		const url = `${baseUrl}${cfg.path}`;

		let response: Response;
		try {
			response = await apiFetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ wallet })
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Network error';
			toast.error(`Faucet request failed: ${msg}`);
			return;
		}

		if (response.status === 200) {
			const data = (await response.json().catch(() => ({}))) as Partial<FaucetSuccess>;
			const sig = data.signature ? truncateSignature(data.signature) : '';
			const suffix = sig ? ` ${sig}` : '';
			toast.success(`Sent ${cfg.amountLabel} test ${cfg.symbol}.${suffix}`);
			// Drive a balance refresh so the chip reflects the new balance
			// immediately and visibility predicates can re-evaluate.
			void cfg.refresh();
			return;
		}

		if (response.status === 429) {
			const data = (await response.json().catch(() => ({}))) as Partial<FaucetCooldown>;
			const retryAfterSec =
				typeof data.retryAfterSec === 'number' ? data.retryAfterSec : 0;
			toast.info(`You can claim again ${formatRetryAfter(retryAfterSec)}`);
			return;
		}

		// Any other non-OK status — surface the backend error message verbatim.
		const data = (await response.json().catch(() => ({}))) as FaucetError;
		toast.error(data.message ?? 'Faucet request failed');
	} finally {
		setInFlight(kind, false);
	}
}

export const faucet = {
	get state() {
		return {
			get usdcInFlight() {
				return usdcInFlight;
			},
			get rwtInFlight() {
				return rwtInFlight;
			},
			/** @deprecated alias for `usdcInFlight`; kept for backwards-compat. */
			get inFlight() {
				return usdcInFlight;
			}
		};
	},
	claimUsdc: (wallet: string) => runClaim('usdc', wallet),
	claimRwt: (wallet: string) => runClaim('rwt', wallet),
	/** @deprecated alias for `claimUsdc`; kept for backwards-compat. */
	claim: (wallet: string) => runClaim('usdc', wallet)
};
