/*
 * Helpers for embedding Figma frames in Storybook stories via @storybook/addon-designs.
 *
 * The Figma file URL is centralized here. To wire it up:
 *   1. Open the Areal app Figma file in a browser (not Desktop).
 *   2. Share → Copy link. Format: https://www.figma.com/design/<fileKey>/<filename>?...
 *   3. Replace `FIGMA_FILE` below with that URL (everything BEFORE `?node-id=...`).
 *   4. Stories using `figmaUrl(nodeId)` will then point at that file's specific frames.
 *
 * The file must be set to "Anyone with link can view" for the iframe embed to render.
 */

/** Base file URL — everything before `?node-id=`. */
export const FIGMA_FILE =
	'https://www.figma.com/design/5TIAyMioCpfMcM176VUwfV/-In-Process--AREAL-Design--Copy-';

/** Optional view-share token (Anyone with the link). */
const FIGMA_SHARE_TOKEN = 'RyToh7ym7fs6jNT6-1';

/**
 * Convert a Figma `node-id` (any of `123:456`, `123-456`) into a full share URL
 * pointing at that specific node within the file.
 */
export function figmaUrl(nodeId: string): string {
	const normalized = nodeId.replace(/:/g, '-');
	return `${FIGMA_FILE}?node-id=${normalized}&t=${FIGMA_SHARE_TOKEN}`;
}

/**
 * Catalog of Figma node-IDs by component / page. Keep this in sync with prior
 * Figma metadata extraction. Stories reference these by name to avoid scattering
 * raw IDs across files.
 */
export const FIGMA_NODES = {
	// Pages
	homepageDesktop: '265:11218', //  5. Homepage (1440×2000)
	page404Desktop: '450:4414', //   7. Page 404 (1440×948)

	// Homepage sections
	heroHeader: '307:4191', // hero text + crystal + aurora
	cardsSection: '307:4192', // PROTOCOL + STOCKS grids

	// Header & Footer instances
	headerHomepage: '289:3111',
	footerHomepage: '265:11593',

	// Sample component instances within page mock-ups
	btnHeroChip: '384:3817', // Wallet-chip button under hero
	btnGoHome: '450:5422' //  "Go to home" button on 404
} as const;

export type FigmaNodeKey = keyof typeof FIGMA_NODES;

/** Convenience: build a story's design parameter from a known node key. */
export function figmaDesign(node: FigmaNodeKey | string) {
	const id = node in FIGMA_NODES ? FIGMA_NODES[node as FigmaNodeKey] : node;
	return {
		type: 'figma' as const,
		url: figmaUrl(id)
	};
}
