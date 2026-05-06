import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { mapError } from './error-mapper';
import * as sdkErrorModule from '@areal/sdk/errors';

// Mock @areal/sdk/errors
vi.mock('@areal/sdk/errors');

describe('error-mapper', () => {
	describe('mapError: user rejection errors', () => {
		it('should return warning for "User rejected" message', () => {
			const err = new Error('User rejected the request');
			const result = mapError(err);

			expect(result.tone).toBe('warning');
			expect(result.title).toBe('Request cancelled');
			expect(result.body).toBe('You declined the wallet prompt.');
			expect(result.code).toBeUndefined();
		});

		it('should return warning for lowercase "user rejected"', () => {
			const err = new Error('user rejected transaction');
			const result = mapError(err);

			expect(result.tone).toBe('warning');
			expect(result.title).toBe('Request cancelled');
		});

		it('should match case-insensitive rejection patterns', () => {
			const messages = [
				'User rejected',
				'user rejected',
				'something rejected the request',
				'The user rejected this action'
			];

			for (const msg of messages) {
				const err = new Error(msg);
				const result = mapError(err);
				expect(result.tone, `Failed for message: ${msg}`).toBe('warning');
			}
		});

		it('should return warning for "rejected the request"', () => {
			const err = new Error('You rejected the request');
			const result = mapError(err);

			expect(result.tone).toBe('warning');
			expect(result.title).toBe('Request cancelled');
		});
	});

	describe('mapError: wallet not found errors', () => {
		it('should return warning for "Phantom not found"', () => {
			const err = new Error('Phantom not found');
			const result = mapError(err);

			expect(result.tone).toBe('warning');
			expect(result.title).toBe('Wallet not found');
			expect(result.body).toBe('Install Phantom to connect.');
		});

		it('should return warning for "not installed" message', () => {
			const err = new Error('Phantom is not installed');
			const result = mapError(err);

			expect(result.tone).toBe('warning');
			expect(result.title).toBe('Wallet not found');
		});
	});

	describe('mapError: Anchor errors with programId', () => {
		it('should delegate to mapAnchorError when programId is provided', () => {
			const mockMapAnchorError = vi.fn().mockReturnValue({
				name: 'Unauthorized',
				message: 'This operation requires authorization',
				code: 100
			});
			vi.mocked(sdkErrorModule.mapAnchorError).mockImplementation(mockMapAnchorError);

			const err = new Error('some error');
			const programId = new PublicKey('11111111111111111111111111111111');

			const result = mapError(err, programId);

			expect(mockMapAnchorError).toHaveBeenCalledWith(err, programId);
			expect(result.tone).toBe('error');
			expect(result.title).toBe('Unauthorized');
			expect(result.body).toBe('This operation requires authorization');
			expect(result.code).toBe(100);
		});

		it('should skip Anchor decoding when mapAnchorError returns null', () => {
			const mockMapAnchorError = vi.fn().mockReturnValue(null);
			vi.mocked(sdkErrorModule.mapAnchorError).mockImplementation(mockMapAnchorError);

			const err = new Error('generic error message');
			const programId = new PublicKey('11111111111111111111111111111111');

			const result = mapError(err, programId);

			expect(result.tone).toBe('error');
			expect(result.title).toBe('Error');
			expect(result.body).toBe('generic error message');
			expect(result.code).toBeUndefined();
		});

		it('should not call mapAnchorError when programId is undefined', () => {
			const mockMapAnchorError = vi.fn();
			vi.mocked(sdkErrorModule.mapAnchorError).mockImplementation(mockMapAnchorError);

			const err = new Error('some error');
			mapError(err);

			expect(mockMapAnchorError).not.toHaveBeenCalled();
		});
	});

	describe('mapError: generic Error fallback', () => {
		it('should return error tone with message for unrecognized Error', () => {
			const err = new Error('Database connection failed');
			const result = mapError(err);

			expect(result.tone).toBe('error');
			expect(result.title).toBe('Error');
			expect(result.body).toBe('Database connection failed');
		});

		it('should handle empty error message', () => {
			const err = new Error('');
			const result = mapError(err);

			expect(result.tone).toBe('error');
			expect(result.title).toBe('Error');
			expect(result.body).toBe('');
		});
	});

	describe('mapError: non-Error thrown values', () => {
		it('should convert string to error descriptor', () => {
			const result = mapError('Something went wrong');

			expect(result.tone).toBe('error');
			expect(result.title).toBe('Error');
			expect(result.body).toBe('Something went wrong');
		});

		it('should convert number to error descriptor', () => {
			const result = mapError(42);

			expect(result.tone).toBe('error');
			expect(result.body).toBe('42');
		});

		it('should convert undefined to error descriptor', () => {
			const result = mapError(undefined);

			expect(result.tone).toBe('error');
			expect(result.body).toBe('undefined');
		});

		it('should convert null to error descriptor', () => {
			const result = mapError(null);

			expect(result.tone).toBe('error');
			expect(result.body).toBe('null');
		});

		it('should convert object to string representation', () => {
			const obj = { code: 500, message: 'Internal error' };
			const result = mapError(obj);

			expect(result.tone).toBe('error');
			expect(result.body).toBe('[object Object]');
		});

		it('should convert custom Error subclass', () => {
			class NetworkError extends Error {
				constructor(msg: string) {
					super(msg);
					this.name = 'NetworkError';
				}
			}

			const err = new NetworkError('Connection timeout');
			const result = mapError(err);

			expect(result.tone).toBe('error');
			expect(result.body).toBe('Connection timeout');
		});
	});

	describe('mapError: edge cases', () => {
		it('should prioritize wallet rejection over Anchor error when both match', () => {
			const mockMapAnchorError = vi.fn().mockReturnValue({
				name: 'SomeError',
				message: 'Some message',
				code: 200
			});
			vi.mocked(sdkErrorModule.mapAnchorError).mockImplementation(mockMapAnchorError);

			const err = new Error('User rejected the transaction');
			const programId = new PublicKey('11111111111111111111111111111111');

			const result = mapError(err, programId);

			// Wallet rejection takes precedence
			expect(result.tone).toBe('warning');
			expect(result.title).toBe('Request cancelled');
			expect(mockMapAnchorError).not.toHaveBeenCalled();
		});

		it('should handle Anchor error with code 0', () => {
			const mockMapAnchorError = vi.fn().mockReturnValue({
				name: 'Success',
				message: 'No error',
				code: 0
			});
			vi.mocked(sdkErrorModule.mapAnchorError).mockImplementation(mockMapAnchorError);

			const err = new Error('unexpected success result');
			const programId = new PublicKey('11111111111111111111111111111111');

			const result = mapError(err, programId);

			expect(result.code).toBe(0);
		});

		it('should handle very long error messages', () => {
			const longMsg = 'Error: '.repeat(100);
			const err = new Error(longMsg);
			const result = mapError(err);

			expect(result.tone).toBe('error');
			expect(result.body).toBe(longMsg);
		});
	});
});
