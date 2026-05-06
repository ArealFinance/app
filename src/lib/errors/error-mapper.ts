/*
 * Error → toast descriptor.
 *
 * Pure function (no side-effects, no toast dispatch) so it can be unit-tested
 * cheaply and reused outside the toast pipeline (e.g. inline form errors).
 */
import type { PublicKey } from '@solana/web3.js';
import { mapAnchorError } from '@areal/sdk/errors';

export type ToastTone = 'error' | 'warning' | 'info';

export interface ErrorDescriptor {
	tone: ToastTone;
	title: string;
	body: string;
	/** Anchor error code, when the error came from an Areal program. */
	code?: number;
}

/**
 * Map an unknown thrown value to a toast-ready descriptor.
 *
 * `programId` lets us decode Anchor errors emitted by Areal programs. Pass
 * the `programId` of the program you were calling. When omitted, we skip
 * Anchor decoding and fall back to the generic Error path.
 */
export function mapError(err: unknown, programId?: PublicKey): ErrorDescriptor {
	// Wallet UX rejections — present as warning, not error. The user did the
	// right thing (chose to abort); we shouldn't paint that red.
	if (err instanceof Error) {
		const msg = err.message;
		if (
			msg.includes('User rejected') ||
			msg.includes('user rejected') ||
			msg.toLowerCase().includes('rejected the request')
		) {
			return {
				tone: 'warning',
				title: 'Request cancelled',
				body: 'You declined the wallet prompt.'
			};
		}

		if (msg.includes('Phantom not found') || msg.includes('not installed')) {
			return {
				tone: 'warning',
				title: 'Wallet not found',
				body: 'Install Phantom to connect.'
			};
		}

		// Try Anchor error decoding (if a program id is in scope).
		if (programId) {
			const mapped = mapAnchorError(err, programId);
			if (mapped) {
				return {
					tone: 'error',
					title: mapped.name,
					body: mapped.message,
					code: mapped.code
				};
			}
		}

		return { tone: 'error', title: 'Error', body: msg };
	}

	return { tone: 'error', title: 'Error', body: String(err) };
}
