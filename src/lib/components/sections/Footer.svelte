<script lang="ts" module>
	export interface FooterLink {
		label: string;
		href: string;
		external?: boolean;
	}

	export interface FooterColumn {
		label: string;
		dotColor?: string; // CSS color, defaults to muted
		links: FooterLink[];
	}
</script>

<script lang="ts">
	import { IconButton } from '$lib/components/ui';
	import { SendAlt, AngleUpSmall } from '$lib/icons';
	import Logo from './Logo.svelte';

	type Props = {
		columns?: FooterColumn[];
		legalLinks?: FooterLink[];
		copyright?: string;
		onSubscribe?: (email: string) => void;
		showScrollToTop?: boolean;
	};

	const defaultColumns: FooterColumn[] = [
		{
			label: 'Documentation',
			dotColor: 'var(--color-teal-900)',
			links: [
				{
					label: 'Introduction',
					href: 'https://docs.areal.finance/get-started/introduction',
					external: true
				},
				{
					label: 'Architecture',
					href: 'https://docs.areal.finance/architecture/overview',
					external: true
				},
				{
					label: 'Ownership Tokens',
					href: 'https://docs.areal.finance/economics/ownership-tokens',
					external: true
				},
				{
					label: 'RWT Token',
					href: 'https://docs.areal.finance/economics/rwt-real-world-token',
					external: true
				},
				// Placeholder — no dedicated SPRK doc page yet (SPRK is a demo OT).
				{ label: 'SPRK Token', href: '/docs/sprk' }
			]
		},
		{
			label: 'About',
			dotColor: 'var(--color-magenta-900)',
			links: [
				{ label: 'Vision', href: 'https://docs.areal.finance/areal/vision', external: true },
				{ label: 'Problem', href: 'https://docs.areal.finance/areal/problem', external: true },
				{ label: 'Solution', href: 'https://docs.areal.finance/areal/solution', external: true },
				{ label: 'Tokens', href: 'https://docs.areal.finance/economics/tokens', external: true },
				{
					label: 'Changelog',
					href: 'https://docs.areal.finance/changelog/overview',
					external: true
				}
			]
		},
		{
			label: 'Discover',
			dotColor: 'var(--color-danger)',
			links: [
				{ label: 'Markets', href: '/markets' },
				{ label: 'Swap', href: '/swap' },
				{ label: 'Portfolio', href: '/portfolio' }
			]
		}
	];

	const defaultLegal: FooterLink[] = [
		// Privacy Policy + Terms of Use have no docs page yet — left as placeholders.
		{ label: 'Privacy Policy', href: '/privacy' },
		{ label: 'Terms of Use', href: '/terms' },
		{
			label: 'Disclaimer',
			href: 'https://docs.areal.finance/security/disclaimer',
			external: true
		},
		{
			label: 'Legal Architecture',
			href: 'https://docs.areal.finance/security/legal-architecture',
			external: true
		},
		{
			label: 'Risk Disclosure',
			href: 'https://docs.areal.finance/security/risk-disclosure',
			external: true
		}
	];

	let {
		columns = defaultColumns,
		legalLinks = defaultLegal,
		copyright = '2026 © Areal Protocol. All Rights Reserved',
		onSubscribe,
		showScrollToTop = true
	}: Props = $props();

	let email = $state('');

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (email.trim() && onSubscribe) {
			onSubscribe(email.trim());
			email = '';
		}
	}

	function scrollToTop() {
		if (typeof window !== 'undefined') {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}
</script>

<footer class="app-footer">
	<div class="footer-inner">
		<div class="footer-grid">
			<div class="footer-brand">
				<Logo />
				<p class="footer-copy">{copyright}</p>
			</div>

			{#each columns as col}
				<div class="footer-col">
					<div class="footer-col-head">
						<span class="footer-col-dot" style:background-color={col.dotColor}></span>
						<span>{col.label}</span>
					</div>
					<ul class="footer-col-list">
						{#each col.links as link}
							<li>
								<a
									href={link.href}
									target={link.external ? '_blank' : undefined}
									rel={link.external ? 'noopener noreferrer' : undefined}
								>
									{link.label}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}

			{#if showScrollToTop}
				<div class="footer-scrolltop">
					<IconButton variant="inset" size="lg" aria-label="Scroll to top" onclick={scrollToTop}>
						<AngleUpSmall size={20} />
					</IconButton>
				</div>
			{/if}
		</div>

		<form class="footer-subscribe" onsubmit={handleSubmit}>
			<div class="footer-subscribe-input">
				<label class="footer-subscribe-label" for="footer-email">Contact Us</label>
				<input
					id="footer-email"
					class="footer-subscribe-control"
					type="email"
					placeholder="Your Email address"
					bind:value={email}
					required
				/>
			</div>
			<IconButton variant="solid" size="xl" type="submit" aria-label="Subscribe">
				<SendAlt size={28} />
			</IconButton>
		</form>

		<div class="footer-legal">
			<span class="footer-status">
				<span class="footer-status-dot" aria-hidden="true"></span>
				<span class="footer-status-label">Stable</span>
			</span>
			<nav class="footer-legal-links" aria-label="Legal">
				{#each legalLinks as link}
					<a
						href={link.href}
						target={link.external ? '_blank' : undefined}
						rel={link.external ? 'noopener noreferrer' : undefined}>{link.label}</a>
				{/each}
			</nav>
		</div>
	</div>
</footer>

<style>
	.app-footer {
		position: relative;
		overflow: hidden;
		padding: var(--space-16) var(--space-4) var(--space-6);
	}

	.footer-inner {
		position: relative;
		z-index: 1;
		max-width: var(--container-max);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-12);
	}

	.footer-grid {
		display: grid;
		grid-template-columns: 1.4fr repeat(3, 1fr) auto;
		gap: var(--space-8);
		align-items: start;
	}

	.footer-brand {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.footer-copy {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: rgba(255, 255, 255, 0.3);
		line-height: var(--leading-normal);
	}

	/* Halvar Breit Bold 18 white per Figma — bigger and brighter than typical column heads. */
	.footer-col-head {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		font-family: var(--font-sans);
		font-size: var(--text-lg); /* 18 */
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
		line-height: var(--leading-normal);
	}

	/* Square 10×10 colored badge before the title (Documentation/About/Discover). */
	.footer-col-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: var(--radius-xs);
		background-color: var(--color-text-muted);
	}

	.footer-col-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.footer-col-list a {
		font-family: var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-muted);
		text-decoration: none;
		transition: color var(--motion-base) var(--ease-out);
	}
	.footer-col-list a:hover {
		color: var(--color-text);
	}

	.footer-scrolltop {
		justify-self: end;
	}

	/* Subscribe — Onest 44 placeholder + 80×80 send. Container per Figma: surface-muted bg
	 * with 2px translucent border, 24-radius. Generous padding so the giant input breathes. */
	.footer-subscribe {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-2);
		padding-left: var(--space-6);
		background-color: var(--color-surface-muted);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-xl);
	}

	.footer-subscribe-input {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
		gap: var(--space-1);
	}

	.footer-subscribe-label {
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	.footer-subscribe-control {
		width: 100%;
		background: transparent;
		border: 0;
		outline: none;
		padding: 0;
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-3xl); /* 44 */
		font-weight: var(--font-weight-regular);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}
	.footer-subscribe-control::placeholder {
		color: var(--color-text);
		opacity: 1;
	}

	.footer-legal {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		flex-wrap: wrap;
	}

	/* "● STABLE" status: solid pill bg, Geist Mono 13 #44D8BA, glowing teal dot. */
	.footer-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: 28px;
		padding: 0 var(--space-3);
		background-color: rgba(255, 255, 255, 0.07);
		border-radius: var(--radius-pill);
	}

	.footer-status-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background-color: var(--color-teal-900);
		box-shadow: var(--glow-teal);
	}

	.footer-status-label {
		font-family: var(--font-mono);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		line-height: 1;
		color: var(--color-teal-900);
	}

	.footer-legal-links {
		display: flex;
		gap: var(--space-6);
		flex-wrap: wrap;
	}

	.footer-legal-links a {
		font-family: var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-tight);
		color: rgba(255, 255, 255, 0.3);
		text-decoration: none;
		transition: color var(--motion-base) var(--ease-out);
	}
	.footer-legal-links a:hover {
		color: var(--color-text);
	}

	@media (max-width: 768px) {
		.app-footer {
			padding: var(--space-12) var(--space-4) var(--space-6);
		}
		.footer-grid {
			grid-template-columns: 1fr 1fr;
			gap: var(--space-6) var(--space-4);
		}
		.footer-brand {
			grid-column: 1 / -1;
		}
		.footer-scrolltop {
			grid-column: 1 / -1;
			justify-self: start;
		}
		.footer-subscribe {
			padding-left: var(--space-4);
		}
		/* 44px placeholder is desktop-only — collapse to body large on mobile. */
		.footer-subscribe-control {
			font-size: var(--text-md);
		}
		.footer-legal {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-3);
		}
		.footer-legal-links {
			gap: var(--space-3);
		}
	}
</style>
