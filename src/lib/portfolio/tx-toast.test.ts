/*
 * Tests for the wallet-room transaction-indexed toast handler.
 *
 * Covers:
 *   - validator: invalid signature shape → no toast, console.warn fired
 *   - validator: unknown kind → no toast, console.warn fired
 *   - visibility gate: hidden tab → no toast
 *   - dedupe: same sig within TTL → second emission silently dropped
 *   - TTL expiry: same sig after TTL → second toast surfaces
 *   - FIFO cap: 257 unique sigs → recentSigs.size === 256, oldest evicted
 *   - KIND_COPY: every valid kind maps to its expected title
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionIndexedEvent } from '@areal/sdk/realtime';

import { createTxToastHandler } from './tx-toast';

const VALID_SIG = '4'.repeat(80); // base58, 80 chars — passes [64,90] regex.
const VALID_WALLET = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';

function buildPayload(overrides: Partial<TransactionIndexedEvent> = {}): TransactionIndexedEvent {
	return {
		wallet: VALID_WALLET,
		kind: 'claim',
		signature: VALID_SIG,
		blockTime: 1_700_000_000,
		...overrides
	};
}

function makeToast() {
	return { success: vi.fn() };
}

const network = { current: 'devnet' };

describe('createTxToastHandler', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	describe('validators', () => {
		it('drops payload with non-base58 signature shape (too short)', () => {
			const toast = makeToast();
			const h = createTxToastHandler({ toast, network, isHidden: () => false });
			h.handle(buildPayload({ signature: 'tooshort' }));
			expect(toast.success).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith('[tx-toast] dropped: invalid signature shape');
		});

		it('drops payload with non-base58 characters in signature', () => {
			const toast = makeToast();
			const h = createTxToastHandler({ toast, network, isHidden: () => false });
			// 'O' and '0' are NOT in the base58 alphabet.
			h.handle(buildPayload({ signature: '0'.repeat(80) }));
			expect(toast.success).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith('[tx-toast] dropped: invalid signature shape');
		});

		it('drops payload with unknown kind', () => {
			const toast = makeToast();
			const h = createTxToastHandler({ toast, network, isHidden: () => false });
			h.handle(buildPayload({ kind: 'evil_kind' as unknown as TransactionIndexedEvent['kind'] }));
			expect(toast.success).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith('[tx-toast] dropped: unknown kind evil_kind');
		});
	});

	describe('visibility gate', () => {
		it('drops payload when isHidden returns true', () => {
			const toast = makeToast();
			const h = createTxToastHandler({ toast, network, isHidden: () => true });
			h.handle(buildPayload());
			expect(toast.success).not.toHaveBeenCalled();
			// No warn — this is a normal soft-drop.
			expect(warnSpy).not.toHaveBeenCalled();
		});
	});

	describe('dedupe within TTL', () => {
		it('second emission of same signature within 5 minutes is silently dropped', () => {
			const toast = makeToast();
			let now = 1_000_000;
			const h = createTxToastHandler({
				toast,
				network,
				isHidden: () => false,
				now: () => now
			});
			h.handle(buildPayload());
			expect(toast.success).toHaveBeenCalledTimes(1);

			// 4 minutes later — still within TTL.
			now += 4 * 60 * 1000;
			h.handle(buildPayload());
			expect(toast.success).toHaveBeenCalledTimes(1);
		});
	});

	describe('TTL expiry', () => {
		it('same signature after 6 minutes surfaces a second toast', () => {
			const toast = makeToast();
			let now = 1_000_000;
			const h = createTxToastHandler({
				toast,
				network,
				isHidden: () => false,
				now: () => now
			});
			h.handle(buildPayload());
			expect(toast.success).toHaveBeenCalledTimes(1);

			// Advance past the 5-minute TTL.
			now += 6 * 60 * 1000;
			h.handle(buildPayload());
			expect(toast.success).toHaveBeenCalledTimes(2);
		});
	});

	describe('FIFO cap', () => {
		it('caps recentSigs at 256 entries; oldest evicted on overflow', () => {
			const toast = makeToast();
			let now = 1_000_000;
			const h = createTxToastHandler({
				toast,
				network,
				isHidden: () => false,
				now: () => now
			});

			// Build 257 deterministic, base58-safe, COLLISION-FREE signatures.
			// Base58 EXCLUDES `0`, `O`, `I`, `l`; encode the index in a custom
			// base-9 alphabet (digits 1-9) so we never hit those forbidden
			// chars. Pad to 80 chars; use a leading 'E' boundary so identical
			// numeric encodings never collide with their padding suffix.
			const ALPHA = '123456789';
			const encode = (n: number) => {
				if (n === 0) return ALPHA[0];
				let s = '';
				while (n > 0) {
					s = ALPHA[n % 9] + s;
					n = Math.floor(n / 9);
				}
				return s;
			};
			const sig = (i: number) => {
				const tag = `E${encode(i)}E`; // 'E' boundaries — base58-safe.
				return tag + '1'.repeat(80 - tag.length);
			};

			// Burst 257 unique sigs — Map size must stay ≤ 256.
			for (let i = 0; i < 257; i++) {
				h.handle(buildPayload({ signature: sig(i) }));
				now += 1; // tiny advance so insertion order is well-defined.
			}

			expect(toast.success).toHaveBeenCalledTimes(257);
			const map = h.__peekRecentSigs();
			expect(map.size).toBe(256);

			// The first signature must have been evicted (FIFO).
			expect(map.has(sig(0))).toBe(false);

			// The most recent one is still present.
			expect(map.has(sig(256))).toBe(true);
		});
	});

	describe('KIND_COPY titles', () => {
		const kinds: Array<[TransactionIndexedEvent['kind'], string]> = [
			['claim', 'Rewards claimed'],
			['swap', 'Swap confirmed'],
			['add_lp', 'Liquidity added'],
			['remove_lp', 'Liquidity removed'],
			['zap_lp', 'Zap confirmed'],
			['mint_rwt', 'RWT minted']
		];

		for (const [kind, expected] of kinds) {
			it(`maps kind=${kind} to title "${expected}"`, () => {
				const toast = makeToast();
				const h = createTxToastHandler({ toast, network, isHidden: () => false });
				h.handle(buildPayload({ kind }));
				expect(toast.success).toHaveBeenCalledTimes(1);
				const [, opts] = toast.success.mock.calls[0]!;
				expect(opts.title).toBe(expected);
			});
		}
	});

	describe('toast body', () => {
		it('includes shortened signature and full explorer URL with cluster', () => {
			const toast = makeToast();
			const h = createTxToastHandler({
				toast,
				network: { current: 'devnet' },
				isHidden: () => false
			});
			h.handle(buildPayload());

			const [body] = toast.success.mock.calls[0]!;
			const head = VALID_SIG.slice(0, 4);
			const tail = VALID_SIG.slice(-4);
			expect(body).toContain(`${head}…${tail}`);
			expect(body).toContain(`https://solscan.io/tx/${VALID_SIG}?cluster=devnet`);
		});
	});
});
