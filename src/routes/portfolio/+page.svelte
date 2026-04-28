<script lang="ts">
	import AppShell from '$lib/components/sections/AppShell.svelte';
	import { Card } from '$lib/components/ui';
</script>

<svelte:head>
	<title>Portfolio · Areal</title>
	<meta name="description" content="Track and manage your DeFi positions on Areal." />
</svelte:head>

<AppShell currentPath="/portfolio">
	<div class="portfolio">
		<header class="portfolio-hero">
			<h1 class="portfolio-title">Portfolio</h1>
			<p class="portfolio-sub">Track and manage your DeFi positions</p>
		</header>

		<div class="portfolio-grid">
			<!-- LEFT: Unclaimed Rewards + Total Value KPI tile -->
			<Card variant="inset" radius="xl" padding="none" class="portfolio-aside">
				<div class="kpi-inner">
					<div class="kpi-block">
						<div class="kpi-label">Unclaimed Rewards</div>
						<div class="kpi-value">$0.00</div>
					</div>
					<div class="kpi-block">
						<div class="kpi-label">Total Value</div>
						<div class="kpi-value">$0.00</div>
					</div>
				</div>
			</Card>

			<!-- RIGHT: stack of 2 section cards -->
			<div class="portfolio-stack">
				<Card variant="inset" radius="xl" padding="none">
					<section class="section">
						<header class="section-head">
							<h2>Ownership tokens</h2>
						</header>
						<div class="section-body section-body-md">
							<svg
								class="empty-illu"
								width="86"
								height="64"
								viewBox="0 0 86 64"
								fill="none"
								aria-hidden="true"
							>
								<rect x="0" y="0" width="86" height="22" rx="6" fill="#3C415F" opacity="0.7" />
								<rect x="0" y="26" width="86" height="22" rx="6" fill="#3C415F" opacity="0.45" />
								<rect x="0" y="52" width="64" height="12" rx="4" fill="#717390" opacity="0.3" />
								<circle cx="12" cy="11" r="4" fill="#73FF83" />
								<circle cx="12" cy="37" r="4" fill="#717390" opacity="0.6" />
							</svg>
							<p class="empty-title">You do not currently hold any tokens</p>
							<p class="empty-sub">Start adding tokens</p>
						</div>
					</section>
				</Card>

				<Card variant="inset" radius="xl" padding="none">
					<section class="section">
						<header class="section-head">
							<h2>Liquidity positions</h2>
						</header>
						<div class="section-body section-body-lg">
							<svg
								class="empty-illu"
								width="100"
								height="76"
								viewBox="0 0 100 76"
								fill="none"
								aria-hidden="true"
							>
								<defs>
									<linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
										<stop offset="0" stop-color="#3C415F" />
										<stop offset="1" stop-color="#111322" />
									</linearGradient>
								</defs>
								<!-- gridline -->
								<line x1="0" y1="64" x2="100" y2="64" stroke="#2A2E37" stroke-width="1" />
								<!-- bars -->
								<rect x="2" y="36" width="14" height="28" rx="3" fill="url(#bar-grad)" />
								<rect x="22" y="20" width="14" height="44" rx="3" fill="url(#bar-grad)" />
								<rect x="42" y="6" width="14" height="58" rx="3" fill="#73FF83" opacity="0.85" />
								<rect x="62" y="28" width="14" height="36" rx="3" fill="url(#bar-grad)" />
								<rect x="82" y="44" width="14" height="20" rx="3" fill="url(#bar-grad)" />
								<!-- spark -->
								<polyline
									points="9,30 29,18 49,4 69,26 89,42"
									stroke="#73FF83"
									stroke-width="1.5"
									fill="none"
									stroke-linecap="round"
									stroke-linejoin="round"
									opacity="0.6"
								/>
							</svg>
							<p class="empty-title">You do not currently hold any tokens</p>
							<p class="empty-sub">Start adding tokens</p>
						</div>
					</section>
				</Card>
			</div>
		</div>
	</div>
</AppShell>

<style>
	.portfolio {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-6) 0 var(--space-12);
	}

	/* ---------- Hero ---------- */
	.portfolio-hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.portfolio-title {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-xl); /* 24 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.portfolio-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: -0.4px;
		color: var(--color-text);
	}

	/* ---------- Grid ---------- */
	/* Per Figma: left aside 476, right main 714, 24 gap. AppShell shell-main
	 * already sits inside the 1214 container, so the columns add up exactly. */
	.portfolio-grid {
		display: grid;
		grid-template-columns: minmax(0, 476px) minmax(0, 714px);
		gap: var(--space-6);
		align-items: start;
	}

	.portfolio-stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		min-width: 0;
	}

	:global(.portfolio-aside) {
		min-width: 0;
	}

	/* ---------- KPI tile ---------- */
	/* Outer card #181A29 wraps an inner #080A0F surface, 4px gutter (radius diff
	 * 24→20). Inside: two stacked KPI blocks. */
	.kpi-inner {
		margin: 4px;
		min-height: 206px;
		padding: 24px;
		background-color: var(--color-surface);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.kpi-block {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.kpi-label {
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-semibold);
		letter-spacing: 2px;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.kpi-value {
		font-family: 'Onest', var(--font-body);
		font-size: 32px;
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
	}

	/* ---------- Section card (Ownership / Liquidity) ---------- */
	.section {
		margin: 4px;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.section-head {
		padding: 20px 20px 16px;
	}

	.section-head h2 {
		margin: 0;
		font-family: var(--font-sans);
		font-size: var(--text-lg); /* 18 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		text-transform: uppercase;
		color: var(--color-text);
	}

	.section-body {
		background-color: var(--color-surface); /* #080A0F */
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
	}

	.section-body-md {
		min-height: 269px; /* Figma: 339 - title region 70 = 269 */
	}

	.section-body-lg {
		min-height: 460px; /* Figma: 530 - title region 70 = 460 */
	}

	.empty-illu {
		display: block;
		margin-bottom: var(--space-3);
	}

	.empty-title {
		margin: 0;
		font-family: 'Onest', var(--font-body);
		font-size: var(--text-base); /* 14 */
		font-weight: var(--font-weight-bold);
		line-height: var(--leading-normal);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text);
		text-align: center;
	}

	.empty-sub {
		margin: 0;
		font-family: var(--font-body);
		font-size: var(--text-sm); /* 13 */
		font-weight: var(--font-weight-medium);
		line-height: var(--leading-normal);
		letter-spacing: -0.4px;
		color: var(--color-text-muted);
		text-align: center;
	}

	/* ---------- Mobile ---------- */
	@media (max-width: 768px) {
		.portfolio {
			padding: var(--space-4) var(--space-3) var(--space-8);
		}
		.portfolio-grid {
			grid-template-columns: 1fr;
		}
		.kpi-inner {
			min-height: auto;
			padding: var(--space-5);
			gap: var(--space-5);
		}
		.section-head {
			padding: var(--space-4) var(--space-4) var(--space-3);
		}
		.section-body {
			padding: var(--space-5);
		}
		.section-body-md,
		.section-body-lg {
			min-height: 220px;
		}
	}
</style>
