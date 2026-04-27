/*
 * Polymorphic component helper.
 *
 * Several primitives (Button, IconButton, WalletAddressChip, TokenRow) need to
 * render as `<a>` when an `href` prop is given, otherwise `<button>`, with a
 * stable shared API for events / class / disabled. This file exposes:
 *
 *   - `PolymorphicProps<TBase>` — discriminated-union prop type
 *     for `(href | type)` polymorphism.
 *   - `polymorphicTag(props)` — runtime tag pick: `'a' | 'button' | 'div'`.
 *
 * Usage in a primitive:
 *
 *   import type { PolymorphicProps } from './_polymorphic';
 *   type Props = { variant: 'primary' | 'outline'; ... } & PolymorphicProps;
 *
 *   {#if href}<a {href} ...>...</a>
 *   {:else}<button {type} ...>...</button>
 *   {/if}
 */
import type {
	HTMLAttributes,
	HTMLAnchorAttributes,
	HTMLButtonAttributes
} from 'svelte/elements';

/** Discriminated union for primitives that render as `<a>` OR `<button>`. */
export type PolymorphicProps =
	| ({ href: string; type?: never } & Omit<HTMLAnchorAttributes, 'href' | 'children'>)
	| ({ href?: undefined; type?: 'button' | 'submit' | 'reset' } & Omit<
			HTMLButtonAttributes,
			'type' | 'children'
		>);

/** Same as above, but also allows a non-interactive `<div>` fallback. */
export type PolymorphicElementProps =
	| ({ href?: undefined; type?: never } & Omit<HTMLAttributes<HTMLDivElement>, 'children'>)
	| PolymorphicProps;
