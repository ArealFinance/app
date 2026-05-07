/*
 * Thin wrapper around the SDK's `isMasterPool` helper. Bridges our local
 * `NetworkId` (the storage-backed `mainnet | devnet | localnet` triple) and
 * the SDK's `ClusterName` (currently identical strings, but routed through
 * a single helper so a future rename on either side is a one-line change).
 *
 * Why a wrapper:
 *   - The contract guards user `add_liquidity` / `zap_liquidity` on master
 *     pools (RWT/USDC, RWT/USDY) so liquidity is only managed by the
 *     Liquidity Nexus. The UI runs the same check defensively to avoid
 *     wallet prompts for txs that will revert.
 *   - `isMasterPool` is cluster-aware (each cluster has independent
 *     RWT/USDC/USDY mints), so callers must thread the active cluster
 *     through. Centralising the call here keeps the cluster mapping in
 *     one place.
 */
import { isMasterPool } from '@areal/sdk/markets';
import type { PoolRow } from '@areal/sdk/markets';
import type { ClusterName } from '@areal/sdk/network';

import type { NetworkId } from '$lib/network/endpoints';

function toCluster(id: NetworkId): ClusterName {
	return id as ClusterName;
}

/**
 * `true` when `(row.tokenAMint, row.tokenBMint)` matches a known protocol
 * master pool for `cluster`. Orientation-agnostic — the SDK normalises mint
 * order before comparing.
 */
export function isPoolRowMaster(row: PoolRow, cluster: NetworkId): boolean {
	return isMasterPool(row.tokenAMint, row.tokenBMint, toCluster(cluster));
}
