<script lang="ts">
	import { getLocale, setLocale, type Locale } from '$demo/locale.svelte';
	import FactBox from './FactBox.svelte';

	const locales: { code: Locale; label: string }[] = [
		{ code: 'en', label: 'English' },
		{ code: 'no', label: 'Norsk' }
	];
</script>

<!--
	The entire front page is driven by one Markdown file (+page.en.md / +page.no.md).
	data-malte attributes mark single elements; data-malte-each marks the grid,
	whose FactBox template repeats once per Markdown block — 8 in English, 6 in
	Norwegian. The locale switch is reactive: malte bakes one branch per locale.
-->
<div class="page">
	<header class="topbar">
		<span class="brand">malte</span>
		<nav class="switcher" aria-label="Language">
			{#each locales as { code, label } (code)}
				<button class:active={getLocale() === code} onclick={() => setLocale(code)}>
					{label}
				</button>
			{/each}
		</nav>
	</header>

	<section class="hero">
		<p class="eyebrow">Vite plugin · two-way Markdown ⇄ Svelte</p>
		<h1 data-malte>Design-time heading</h1>
		<p class="tagline" data-malte>Design-time tagline, replaced by Markdown.</p>
		<div class="cta">
			<a class="btn" href="https://github.com/oselvar/malte">View on GitHub</a>
			<code class="install">pnpm add -D @oselvar/malte</code>
		</div>
	</section>

	<section class="facts">
		<h2 data-malte>Why teams reach for malte</h2>
		<div class="grid" data-malte-each>
			<!--
				One FactBox template. The Markdown decides how many render: each ---
				block below the fixed markers becomes a card, so English shows 8 and
				Norwegian shows 6 — from the same component.
			-->
			<FactBox>Design-time fact</FactBox>
		</div>
	</section>

	<footer class="foot">
		<p>
			Every word on this page comes from <code>src/routes/+page.en.md</code>. The
			<code>.svelte</code> layout never changes.
		</p>
	</footer>
</div>

<style>
	.page {
		--accent: #4f46e5;
		--ink: #0f172a;
		--muted: #475569;
		--border: #e2e8f0;
		--subtle: #f8fafc;

		width: 100%;
		max-width: 72rem;
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 4vw, 2.5rem) 4rem;
		color: var(--ink);
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-block: 0.5rem 1.5rem;
	}

	.brand {
		font-weight: 700;
		letter-spacing: -0.01em;
		font-size: 1.1rem;
	}

	.switcher {
		display: flex;
		gap: 0.4rem;
	}

	.switcher button {
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 999px;
		padding: 0.3rem 0.85rem;
		font: inherit;
		font-size: 0.85rem;
		color: var(--muted);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.switcher button.active {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}

	/* Hero */
	.hero {
		text-align: center;
		padding: clamp(2.5rem, 8vw, 5.5rem) 0 clamp(2rem, 6vw, 4rem);
	}

	.eyebrow {
		margin: 0 0 1rem;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.hero h1 {
		margin: 0 auto;
		max-width: 16ch;
		font-size: clamp(2.5rem, 8vw, 4.75rem);
		line-height: 1.04;
		letter-spacing: -0.03em;
		font-weight: 800;
	}

	.tagline {
		margin: 1.25rem auto 0;
		max-width: 40rem;
		font-size: clamp(1.05rem, 2.5vw, 1.3rem);
		line-height: 1.55;
		color: var(--muted);
	}

	.tagline :global(strong) {
		color: var(--ink);
	}

	.cta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 2rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		padding: 0.65rem 1.25rem;
		border-radius: 999px;
		background: var(--ink);
		color: #fff;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.95rem;
		transition: transform 0.15s ease;
	}

	.btn:hover {
		transform: translateY(-2px);
	}

	.install {
		max-width: 100%;
		overflow-x: auto;
		padding: 0.6rem 1rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--subtle);
		font-size: 0.9rem;
		color: var(--ink);
		white-space: nowrap;
	}

	/* Facts */
	.facts {
		margin-top: clamp(1rem, 4vw, 2.5rem);
	}

	.facts h2 {
		margin: 0 0 1.5rem;
		text-align: center;
		font-size: clamp(1.4rem, 4vw, 2rem);
		letter-spacing: -0.02em;
		font-weight: 750;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
		gap: clamp(0.75rem, 2vw, 1.1rem);
	}

	.foot {
		margin-top: clamp(2.5rem, 7vw, 4.5rem);
		text-align: center;
		color: var(--muted);
		font-size: 0.9rem;
	}

	.foot code,
	.install {
		font-family:
			ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
	}

	.foot code {
		background: var(--subtle);
		border: 1px solid var(--border);
		padding: 0.1rem 0.4rem;
		border-radius: 0.4rem;
		font-size: 0.85em;
	}
</style>
