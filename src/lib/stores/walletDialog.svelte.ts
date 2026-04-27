/*
 * Walle UI dialog controller — singleton state for "which wallet modal is open".
 *
 *  - 'connect' → WalletDialog (state A: pick provider / sign in)
 *  - 'panel'   → WalletPanel  (state B: address + transactions)
 *  - null      → no modal
 */

export type WalletDialogMode = 'connect' | 'panel' | null;

let mode = $state<WalletDialogMode>(null);

export const walletDialog = {
	get mode() {
		return mode;
	},
	open(next: Exclude<WalletDialogMode, null>) {
		mode = next;
	},
	close() {
		mode = null;
	},
	toggle(next: Exclude<WalletDialogMode, null>) {
		mode = mode === next ? null : next;
	}
};
