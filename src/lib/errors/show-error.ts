/*
 * Toast adapter — turns a thrown value into a fired toast in one call.
 *
 * Two-layer split: keep `mapError` pure for testing; this thin wrapper is the
 * place where side-effects happen.
 */
import type { PublicKey } from '@solana/web3.js';
import { toast } from '$lib/components/ui';
import { mapError } from './error-mapper';

export function showError(err: unknown, programId?: PublicKey): void {
	const desc = mapError(err, programId);
	toast[desc.tone](desc.body, { title: desc.title });
}
