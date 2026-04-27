<script lang="ts" module>
	export type TokenAvatarSize = 'sm' | 'md' | 'lg';
	export type TokenAvatarTone =
		| 'purple'
		| 'blue'
		| 'teal'
		| 'magenta'
		| 'orange'
		| 'green'
		| 'red'
		| 'neutral';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		symbol?: string;
		size?: TokenAvatarSize;
		tone?: TokenAvatarTone;
		src?: string;
		alt?: string;
		children?: Snippet;
	} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

	let {
		symbol,
		size = 'md',
		tone = 'purple',
		src,
		alt,
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const initial = $derived(symbol ? symbol[0] : '');
</script>

<span class="avatar avatar-size-{size} avatar-tone-{tone} {className}" {...rest}>
	{#if children}
		{@render children()}
	{:else if src}
		<img class="avatar-img" {src} alt={alt ?? symbol ?? ''} />
	{:else}
		<span class="avatar-initial" aria-hidden="true">{initial}</span>
	{/if}
</span>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		overflow: hidden;
		color: var(--color-white-900);
		font-family: var(--font-sans);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0;
		user-select: none;
	}

	/* Sizes */
	.avatar-size-sm {
		width: 28px;
		height: 28px;
		font-size: var(--text-sm);
	}
	.avatar-size-md {
		width: 36px;
		height: 36px;
		font-size: var(--text-base);
	}
	.avatar-size-lg {
		width: 44px;
		height: 44px;
		font-size: var(--text-md);
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.avatar-initial {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		text-transform: uppercase;
	}

	/* Tones */
	.avatar-tone-purple {
		background-color: var(--color-purple-700);
	}
	.avatar-tone-blue {
		background-color: var(--color-blue-900);
	}
	.avatar-tone-teal {
		background-color: var(--color-teal-900);
	}
	.avatar-tone-magenta {
		background-color: var(--color-magenta-900);
	}
	.avatar-tone-orange {
		background-color: var(--color-orange-900);
	}
	.avatar-tone-green {
		background-color: var(--color-green-900);
		color: var(--color-text-inverse);
	}
	.avatar-tone-red {
		background-color: var(--color-red-900);
	}
	.avatar-tone-neutral {
		background-color: var(--color-surface-inset);
		color: var(--color-text);
	}
</style>
