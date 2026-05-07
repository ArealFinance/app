export {
	connectPhantom,
	disconnectPhantom,
	getPhantomProvider,
	isPhantomInstalled
} from './phantom-provider';
export type { PhantomProvider } from './phantom-provider';
export {
	connectSolflare,
	disconnectSolflare,
	getSolflareProvider,
	isSolflareInstalled
} from './solflare-provider';
export type { SolflareProvider } from './solflare-provider';
// Deeplink helpers — dormant for desktop; kept here for the future mobile flow.
export {
	cleanupDeepLinkState,
	hasDeepLinkReturn,
	initiatePhantomConnect,
	isMobileDevice,
	handlePhantomReturn
} from './phantom-deeplink';
export { createMockWallet, createMockSolflareWallet } from './storybook-mock';
export type { MockWalletApi, MockWalletStatus } from './storybook-mock';
