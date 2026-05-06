export {
	connectPhantom,
	disconnectPhantom,
	getPhantomProvider,
	isPhantomInstalled
} from './phantom-provider';
export type { PhantomProvider } from './phantom-provider';
// Deeplink helpers — dormant for desktop; kept here for the future mobile flow.
export {
	cleanupDeepLinkState,
	hasDeepLinkReturn,
	initiatePhantomConnect,
	isMobileDevice,
	handlePhantomReturn
} from './phantom-deeplink';
export { createMockWallet } from './storybook-mock';
export type { MockWalletApi, MockWalletStatus } from './storybook-mock';
