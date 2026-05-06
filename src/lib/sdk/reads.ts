import type { Connection, PublicKey } from '@solana/web3.js';
import { findRwtVaultPda } from '@areal/sdk/pda';
import { parseRwtVault } from '@areal/sdk/rwt-engine';

export interface NavBookValueSnapshot {
	/** RwtVault.navBookValue (raw u64 in token base units). */
	navBookValue: bigint;
	/** Slot the read landed on, per `getSlot()`. */
	slot: number;
	/** Wall-clock time the read finished (ms since epoch). */
	fetchedAt: number;
}

/**
 * Smoke read — pull the RWT vault account and return its `navBookValue`.
 *
 * Returns `null` when the vault account doesn't exist on the active network
 * (e.g. localnet without programs deployed, or a fresh devnet without
 * `initialize_vault` having run).
 */
export async function readNavBookValue(
	conn: Connection,
	programIds: { rwtEngine: PublicKey }
): Promise<NavBookValueSnapshot | null> {
	const [vaultPda] = findRwtVaultPda(programIds.rwtEngine);
	const info = await conn.getAccountInfo(vaultPda);
	if (!info) return null;
	const slot = await conn.getSlot();
	const vault = parseRwtVault(info.data);
	return {
		navBookValue: vault.navBookValue,
		slot,
		fetchedAt: Date.now()
	};
}
