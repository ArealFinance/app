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
 * Per-error-name overrides for known Anchor errors.
 *
 * The SDK's `mapAnchorError` returns the IDL-declared `name` and `msg`. The
 * IDL `msg` strings are written for contract developers, not end users —
 * "Output below min_amount_out" is correct but unhelpful for someone who
 * just clicked a Swap button. We translate a curated set into actionable
 * one-liners. Any error not in this map falls back to the IDL `msg`.
 *
 * Keyed by `idlError.name` (e.g. "SlippageExceeded") so a DexError #6011
 * and a YieldDistribution error of the same name would both translate —
 * the contracts intentionally use distinct names so collisions are not a
 * practical concern.
 */
const FRIENDLY_BY_NAME: Record<string, { title: string; body: string }> = {
	// native-dex errors that surface to a user during a swap.
	SlippageExceeded: {
		title: 'Price moved',
		body: 'Price moved, try increasing slippage tolerance.'
	},
	ZeroOutput: {
		title: 'Amount too small',
		body: 'Output amount is too small — try a larger swap.'
	},
	PoolNotActive: {
		title: 'Pool paused',
		body: 'This pool is currently paused.'
	},
	DexPaused: {
		title: 'Trading paused',
		body: 'Trading is temporarily paused.'
	},
	EmptyReserves: {
		title: 'Empty pool',
		body: 'No liquidity in this pool.'
	},
	InsufficientLiquidity: {
		title: 'Low liquidity',
		body: 'Not enough liquidity for this size.'
	},

	// native-dex LP-path errors that surface to a user during
	// add_liquidity / zap_liquidity / remove_liquidity / claim_lp_fees.
	InsufficientShares: {
		title: 'Insufficient shares',
		body: 'You do not have enough LP shares for this withdrawal.'
	},
	InvalidPoolType: {
		title: 'Pool type not supported',
		body: 'Concentrated pools are not yet supported for this action.'
	},
	MissingOtTreasuryAccount: {
		title: 'Missing fee account',
		body: 'OT treasury fee account is missing for this pool.'
	},
	// Defensive: the contract may add an explicit master-pool block in a
	// future revision. Keep a friendly translation ready so we don't fall
	// through to the raw IDL `msg`.
	MasterPoolUserLpDisabled: {
		title: 'Liquidity managed by Areal Nexus',
		body: 'User liquidity is managed by Areal Nexus on this pool.'
	},

	// rwt-engine errors that surface to a user during mint_rwt.
	// Note: `SlippageExceeded` is a name collision with the dex error above;
	// the friendly copy fits both paths (price moved during the action) so we
	// reuse a single override.
	MintPaused: {
		title: 'Minting paused',
		body: 'Minting is currently paused.'
	},
	BelowMinMint: {
		title: 'Amount too small',
		body: 'Amount is below the $1 minimum.'
	},
	ZeroSlippage: {
		title: 'Slippage required',
		body: 'Slippage tolerance must be greater than 0.'
	},
	ZeroRwtOutput: {
		title: 'Amount too small',
		body: 'Amount is too small for the current NAV.'
	},
	InvalidTokenAccount: {
		title: 'Token account error',
		body: 'Token account validation failed.'
	}
};

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
				const friendly = FRIENDLY_BY_NAME[mapped.name];
				if (friendly) {
					return {
						tone: 'error',
						title: friendly.title,
						body: friendly.body,
						code: mapped.code
					};
				}
				return {
					tone: 'error',
					title: mapped.name,
					body: mapped.message,
					code: mapped.code
				};
			}
		}

		// Generic fallback for unrecognized errors. We deliberately do NOT
		// surface `err.message` to the user — RPC responses can leak URLs,
		// internal node IDs, or stack-trace fragments. Log the original
		// message for developers and show a neutral string instead.
		console.warn('[mapError] Unrecognized error:', msg);
		return {
			tone: 'error',
			title: 'Error',
			body: 'Something went wrong. Please try again.'
		};
	}

	console.warn('[mapError] Unrecognized non-Error thrown value:', err);
	return {
		tone: 'error',
		title: 'Error',
		body: 'Something went wrong. Please try again.'
	};
}
