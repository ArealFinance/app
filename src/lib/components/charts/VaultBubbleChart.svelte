<script lang="ts" module>
	export type VaultBubble = {
		id: string;
		symbol: string;
		usd: string;
		color: string;
		/** Visual radius in px (circle diameter = radius * 2). */
		bubbleSize: number;
	};
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		forceSimulation,
		forceCollide,
		forceX,
		forceY,
		type Simulation,
		type SimulationNodeDatum
	} from 'd3-force';

	type Props = {
		bubbles: VaultBubble[];
		/** Chart canvas height in px. Width comes from the container. */
		height?: number;
	};

	let { bubbles, height = 280 }: Props = $props();

	type Node = SimulationNodeDatum & VaultBubble & { r: number };

	let container = $state<HTMLDivElement>();
	let width = $state(800);
	let nodes = $state<Node[]>([]);
	let sim: Simulation<Node, undefined> | null = null;

	function buildNodes(): Node[] {
		// Sort largest-first so the biggest orb anchors near the centre
		// and smaller ones distribute around it. d3-force handles overlap
		// via collision; this just gives the layout a good starting point.
		return [...bubbles]
			.sort((a, b) => b.bubbleSize - a.bubbleSize)
			.map((b, i) => {
				const r = b.bubbleSize / 2;
				// Seed positions on a coarse spiral so the simulation has
				// somewhere to start; otherwise everything stacks at (0,0)
				// and collision resolution becomes jittery.
				const angle = i * 2.4; // golden-ish stride
				const radius = i === 0 ? 0 : 40 + i * 18;
				return {
					...b,
					r,
					x: Math.cos(angle) * radius,
					y: Math.sin(angle) * radius
				};
			});
	}

	function start() {
		if (!container) return;
		// Fallback so the simulation has a workable canvas even if the
		// container hasn't been measured yet on first paint.
		width = container.clientWidth || 600;
		nodes = buildNodes();
		const cx = width / 2;
		const cy = height / 2;

		sim = forceSimulation<Node>(nodes)
			.force('x', forceX(cx).strength(0.06))
			.force('y', forceY(cy).strength(0.08))
			// Pad collision so circles never touch — keeps the silhouette
			// clean and gives the inset glow on each orb breathing room.
			.force('collide', forceCollide<Node>((d) => d.r + 4).strength(0.95))
			.alpha(1)
			.alphaDecay(0.04)
			.on('tick', () => {
				// Hard-clamp bubbles inside the canvas — collision alone can
				// punt the largest orb past the top/bottom edge.
				for (const n of nodes) {
					n.x = Math.max(n.r, Math.min(width - n.r, n.x ?? 0));
					n.y = Math.max(n.r, Math.min(height - n.r, n.y ?? 0));
				}
				// Reactivity nudge: replace the array so Svelte re-renders.
				nodes = [...nodes];
			});
	}

	function stop() {
		sim?.stop();
		sim = null;
	}

	onMount(() => {
		// Defer one frame so the container has been laid out and
		// `clientWidth` returns a real value (not 0).
		requestAnimationFrame(start);

		const ro = new ResizeObserver(() => {
			if (!container || !sim) return;
			const next = container.clientWidth || width;
			if (next === width) return;
			width = next;
			sim.force('x', forceX(width / 2).strength(0.06));
			sim.force('y', forceY(height / 2).strength(0.08));
			sim.alpha(0.4).restart();
		});
		if (container) ro.observe(container);

		return () => ro.disconnect();
	});

	onDestroy(stop);
</script>

<div class="bubble-chart" bind:this={container} style:height="{height}px" aria-hidden="true">
	{#each nodes as n (n.id)}
		<div
			class="bubble"
			style:width="{n.r * 2}px"
			style:height="{n.r * 2}px"
			style:transform="translate3d({(n.x ?? 0) - n.r}px, {(n.y ?? 0) - n.r}px, 0)"
			style:--bubble-glow={n.color}
		>
			<span class="bubble-amount" style:font-size="{Math.max(11, Math.min(32, n.r * 0.32))}px">
				{n.usd}
			</span>
		</div>
	{/each}
</div>

<style>
	.bubble-chart {
		position: relative;
		width: 100%;
		overflow: hidden;
	}

	.bubble {
		position: absolute;
		left: 0;
		top: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: radial-gradient(
			circle at 50% 30%,
			color-mix(in srgb, var(--bubble-glow) 65%, #18094d) 0%,
			#080a0f 100%
		);
		box-shadow: inset 0 0 24px var(--bubble-glow);
		color: #fff;
		/* No CSS transition on the transform — d3-force ticks ~60fps and
		 * an extra ease lag makes the motion feel mushy. The simulation
		 * itself is the animation. */
		will-change: transform;
	}

	.bubble-amount {
		font-family: var(--font-body);
		font-weight: 600;
		letter-spacing: -0.01em;
		color: #fff;
		text-align: center;
		padding: 0 4px;
	}
</style>
