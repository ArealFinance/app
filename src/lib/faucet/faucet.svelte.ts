/*
 * Testnet USDC faucet client — runes-based singleton.
 *
 * Single responsibility: drive the `POST /faucet/usdc` round-trip and turn
 * each well-known response shape into a toast + optional balance refresh.
 *
 * Status codes we care about:
 *   - 200          → success toast with truncated tx signature, refresh USDC.
 *   - 429          → cooldown info toast formatted from `retryAfterSec`.
 *   - other non-OK → error toast surfacing the backend `message` (or fallback).
 *
 * Single-flight: while a request is in-flight, additional `claim()` calls are
 * no-ops. Mirrors the `mint`/`swap` FSM convention and keeps the UI button
 * "disabled while pending" honest even if the disabled attribute is bypassed.
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

let inFlight: boolean = $state(false);

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

async function claim(wallet: string): Promise<void> {
	if (inFlight) return;
	inFlight = true;
	try {
		const baseUrl = network.endpoint.backendApiUrl;
		const url = `${baseUrl}/faucet/usdc`;

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
			toast.success(`Sent 1000 test USDC.${suffix}`);
			// Drive a balance refresh so the chip flips from 0 → 1000 USDC and the
			// faucet button hides itself (the visibility predicate keys on
			// `usdcBalance === 0n`).
			void userBalances.refreshAll();
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
		inFlight = false;
	}
}

export const faucet = {
	get state() {
		return {
			get inFlight() {
				return inFlight;
			}
		};
	},
	claim
};
