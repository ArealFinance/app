/**
 * Shorten a wallet address by keeping the first and last `n` characters.
 *
 *   truncateAddress('41LU…PP5K', 4)  → '41LU…PP5K'
 *   truncateAddress('abcdefghij', 3) → 'abc…hij'
 *   truncateAddress('short', 4)      → 'short'  (passthrough; not enough chars to truncate)
 *   truncateAddress('', 4)           → ''
 */
export function truncateAddress(address: string, n = 4): string {
	if (!address) return '';
	if (address.length <= n * 2 + 3) return address;
	return `${address.slice(0, n)}…${address.slice(-n)}`;
}
