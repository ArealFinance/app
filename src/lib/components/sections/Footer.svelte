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
	import { Input, IconButton, StatusPill } from '$lib/components/ui';
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
				{ label: 'Introduction', href: '/docs' },
				{ label: 'Architecture', href: '/docs/architecture' },
				{ label: 'Ownership Tokens', href: '/docs/ownership-tokens' },
				{ label: 'RWT Token', href: '/docs/rwt' },
				{ label: 'ARL Token', href: '/docs/arl' }
			]
		},
		{
			label: 'About',
			dotColor: 'var(--color-magenta-900)',
			links: [
				{ label: 'Vision', href: '/about/vision' },
				{ label: 'Problem', href: '/about/problem' },
				{ label: 'Solution', href: '/about/solution' },
				{ label: 'Tokens', href: '/about/tokens' },
				{ label: 'Changelog', href: '/changelog' }
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
		{ label: 'Privacy Policy', href: '/privacy' },
		{ label: 'Terms of Use', href: '/terms' },
		{ label: 'Disclaimer', href: '/disclaimer' },
		{ label: 'Legal Architecture', href: '/legal' },
		{ label: 'Risk Disclosure', href: '/risk' }
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
				<div class="footer-subscribe-label">Contact Us</div>
				<Input
					bind:value={email}
					type="email"
					placeholder="Your Email address"
					variant="ghost"
					size="lg"
					required
				/>
			</div>
			<IconButton variant="solid" size="lg" type="submit" aria-label="Subscribe">
				<SendAlt size={20} />
			</IconButton>
		</form>

		<div class="footer-legal">
			<StatusPill variant="dot" tone="success" size="md">Stable</StatusPill>
			<nav class="footer-legal-links" aria-label="Legal">
				{#each legalLinks as link}
					<a href={link.href}>{link.label}</a>
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
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		line-height: var(--leading-relaxed);
	}

	.footer-col-head {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text);
	}

	.footer-col-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
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
		font-size: var(--text-sm);
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

	/* Subscribe — composes ghost Input + solid IconButton */
	.footer-subscribe {
		display: flex;
		gap: var(--space-3);
		align-items: stretch;
		padding: var(--space-3);
		background-color: var(--color-surface-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
	}

	.footer-subscribe-input {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-width: 0;
	}

	.footer-subscribe-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		padding: 0 var(--space-5);
		margin-bottom: -4px;
	}

	.footer-legal {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
		flex-wrap: wrap;
	}

	.footer-legal-links {
		display: flex;
		gap: var(--space-6);
		flex-wrap: wrap;
	}

	.footer-legal-links a {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		text-decoration: none;
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
