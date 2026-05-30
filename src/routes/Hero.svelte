<!--
	This component holds the *design* — layout, classes, structure. The prose is
	authored in the sibling Markdown companions (Hero.en.md / Hero.no.md) and
	injected by the marte Vite plugin at build time. The text below is just a
	design-time preview; marte replaces it with the Markdown content.
-->
<section class="hero">
	<h1>Markdown ⇄ Svelte</h1>
	<p>This paragraph is a design-time placeholder, replaced by Markdown.</p>
</section>

<section class="features">
	<h2 data-marte="features-title">Why marte</h2>
	<p>First feature placeholder.</p>
	<p>Second feature placeholder.</p>
</section>

<style>
	.hero {
		padding: 2rem 0;
		border-bottom: 1px solid #e4e4e7;
	}

	.hero :global(h1) {
		font-size: 2.5rem;
		line-height: 1.1;
		margin: 0 0 0.5rem;
	}

	.features {
		padding-top: 1.5rem;
	}

	.features :global(h2) {
		font-size: 1.25rem;
		margin: 0 0 0.5rem;
	}
</style>
