import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import type { Connection, AccountInfo } from '@solana/web3.js';
import { readNavBookValue, type NavBookValueSnapshot } from './reads';
import * as pdaModule from '@areal/sdk/pda';
import * as rwtEngineModule from '@areal/sdk/rwt-engine';

// Mock @areal/sdk modules
vi.mock('@areal/sdk/pda');
vi.mock('@areal/sdk/rwt-engine');

describe('sdk/reads', () => {
	let mockConnection: Partial<Connection>;
	let mockProgramIds: { rwtEngine: PublicKey };

	beforeEach(() => {
		mockConnection = {
			getAccountInfo: vi.fn(),
			getSlot: vi.fn()
		};

		mockProgramIds = {
			rwtEngine: new PublicKey('RwtV8m5UVFgnYYuNvZFkQKVawTp7x4gkM3uVsEaMgVd')
		};

		// Reset mocks
		vi.clearAllMocks();
	});

	describe('readNavBookValue: happy path', () => {
		it('should return NavBookValueSnapshot when vault exists', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const navBookValue = BigInt('1000000000');
			const slot = 12345;
			const beforeNow = Date.now();

			// Mock PDA finder
			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);

			// Mock account info
			const mockAccountInfo = {
				data: Buffer.from([1, 2, 3, 4]),
				executable: false,
				lamports: 1000000,
				owner: new PublicKey('11111111111111111111111111111111')
			} as AccountInfo<Buffer>;

			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue(mockAccountInfo);
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(slot);

			// Mock vault parser
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue
			} as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);
			const afterNow = Date.now();

			expect(result).not.toBeNull();
			expect(result?.navBookValue).toBe(navBookValue);
			expect(result?.slot).toBe(slot);
			expect(result?.fetchedAt).toBeGreaterThanOrEqual(beforeNow);
			expect(result?.fetchedAt).toBeLessThanOrEqual(afterNow);
		});

		it('should pass correct program id to findRwtVaultPda', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1, 2, 3]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(1)
			} as any);

			await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(pdaModule.findRwtVaultPda).toHaveBeenCalledWith(mockProgramIds.rwtEngine);
		});

		it('should pass vault account data to parseRwtVault', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const accountData = Buffer.from('vault-data');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: accountData,
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(1)
			} as any);

			await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(rwtEngineModule.parseRwtVault).toHaveBeenCalledWith(accountData);
		});

		it('should call getSlot after getting account info', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(999);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(1)
			} as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(mockConnection.getSlot).toHaveBeenCalled();
			expect(result?.slot).toBe(999);
		});

		it('should handle large navBookValue', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const largeValue = BigInt('18446744073709551615'); // max u64

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: largeValue
			} as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(result?.navBookValue).toBe(largeValue);
		});
	});

	describe('readNavBookValue: account not found', () => {
		it('should return null when vault account does not exist', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue(null);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(result).toBeNull();
		});

		it('should not call getSlot when account not found', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue(null);

			await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(mockConnection.getSlot).not.toHaveBeenCalled();
		});

		it('should not call parseRwtVault when account not found', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue(null);

			await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(rwtEngineModule.parseRwtVault).not.toHaveBeenCalled();
		});

		it('should not throw when account not found', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue(null);

			// Should not throw
			await expect(
				readNavBookValue(mockConnection as Connection, mockProgramIds)
			).resolves.toBeNull();
		});
	});

	describe('readNavBookValue: parsing errors', () => {
		it('should propagate error when parseRwtVault throws', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const parseError = new Error('Invalid vault data');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1, 2, 3]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockImplementation(() => {
				throw parseError;
			});

			await expect(
				readNavBookValue(mockConnection as Connection, mockProgramIds)
			).rejects.toThrow('Invalid vault data');
		});

		it('should propagate error when getAccountInfo throws', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const networkError = new Error('RPC call failed');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockRejectedValue(networkError);

			await expect(
				readNavBookValue(mockConnection as Connection, mockProgramIds)
			).rejects.toThrow('RPC call failed');
		});

		it('should propagate error when getSlot throws', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const slotError = new Error('Cannot get slot');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockRejectedValue(slotError);

			await expect(
				readNavBookValue(mockConnection as Connection, mockProgramIds)
			).rejects.toThrow('Cannot get slot');
		});
	});

	describe('readNavBookValue: edge cases', () => {
		it('should handle zero navBookValue', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(0)
			} as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(result?.navBookValue).toBe(BigInt(0));
		});

		it('should handle slot 0', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(0);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(1)
			} as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(result?.slot).toBe(0);
		});

		it('should preserve fetchedAt timestamp accuracy', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(1)
			} as any);

			const beforeTime = Date.now();
			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);
			const afterTime = Date.now();

			expect(result?.fetchedAt).toBeGreaterThanOrEqual(beforeTime);
			expect(result?.fetchedAt).toBeLessThanOrEqual(afterTime);
		});

		it('should handle empty account data', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(1)
			} as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(result).not.toBeNull();
			expect(result?.navBookValue).toBe(BigInt(1));
		});

		it('should handle account with additional fields', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const vaultData = { navBookValue: BigInt(999), someOtherField: 'value' };

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue(vaultData as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			expect(result?.navBookValue).toBe(BigInt(999));
		});
	});

	describe('NavBookValueSnapshot type', () => {
		it('should match NavBookValueSnapshot interface', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');
			const expectedSlot = 56789;
			const expectedValue = BigInt('123456789');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(expectedSlot);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: expectedValue
			} as any);

			const result = await readNavBookValue(mockConnection as Connection, mockProgramIds);

			// Verify result satisfies NavBookValueSnapshot interface
			if (result !== null) {
				const snapshot: NavBookValueSnapshot = result;
				expect(snapshot.navBookValue).toBe(expectedValue);
				expect(snapshot.slot).toBe(expectedSlot);
				expect(typeof snapshot.fetchedAt).toBe('number');
				expect(snapshot.fetchedAt).toBeGreaterThan(0);
			}
		});
	});

	describe('readNavBookValue: concurrent calls', () => {
		it('should handle multiple concurrent calls', async () => {
			const vaultPda = new PublicKey('DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK');

			vi.mocked(pdaModule.findRwtVaultPda).mockReturnValue([vaultPda, 254]);
			vi.mocked(mockConnection.getAccountInfo as any).mockResolvedValue({
				data: Buffer.from([1]),
				executable: false,
				lamports: 1000000,
				owner: mockProgramIds.rwtEngine
			});
			vi.mocked(mockConnection.getSlot as any).mockResolvedValue(100);
			vi.mocked(rwtEngineModule.parseRwtVault).mockReturnValue({
				navBookValue: BigInt(1)
			} as any);

			const promises = [
				readNavBookValue(mockConnection as Connection, mockProgramIds),
				readNavBookValue(mockConnection as Connection, mockProgramIds),
				readNavBookValue(mockConnection as Connection, mockProgramIds)
			];

			const results = await Promise.all(promises);

			expect(results).toHaveLength(3);
			results.forEach(result => {
				expect(result).not.toBeNull();
				expect(result?.navBookValue).toBe(BigInt(1));
			});
		});
	});
});
