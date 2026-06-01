<script lang="ts">
	import type { Snippet } from 'svelte';

	// A stat/benefit card. malte replaces its slot content (marked with a
	// `<!-- malte -->` comment at the use site) with a block from the page's
	// Markdown. The card chrome — border, hover, the accent lead — is all here.
	let { children }: { children: Snippet } = $props();
</script>

<div class="fact">
	<span class="dot" aria-hidden="true"></span>
	<p class="body">{@render children()}</p>
</div>

<style>
	.fact {
		position: relative;
		display: flex;
		gap: 0.85rem;
		padding: 1.35rem 1.35rem 1.4rem;
		background: #fff;
		border: 1px solid var(--border, #e2e8f0);
		border-radius: 0.9rem;
		box-shadow: 0 1px 2px rgb(15 23 42 / 0.04);
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			border-color 0.15s ease;
	}

	.fact:hover {
		transform: translateY(-3px);
		border-color: color-mix(in srgb, var(--accent, #4f46e5) 35%, #e2e8f0);
		box-shadow: 0 12px 30px -12px rgb(79 70 229 / 0.25);
	}

	.dot {
		flex: none;
		width: 0.7rem;
		height: 0.7rem;
		margin-top: 0.45rem;
		border-radius: 50%;
		background: var(--accent, #4f46e5);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent, #4f46e5) 14%, transparent);
	}

	.body {
		margin: 0;
		font-size: 0.98rem;
		line-height: 1.5;
		color: var(--muted, #475569);
	}

	/* The Markdown lead (**bold**) becomes the card's headline. */
	.body :global(strong) {
		display: block;
		margin-bottom: 0.3rem;
		font-size: 1.08rem;
		font-weight: 650;
		color: var(--ink, #0f172a);
	}
</style>
