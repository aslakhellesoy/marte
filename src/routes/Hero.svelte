<!--
	This component holds the *design* — layout, classes, structure. The prose is
	authored in the sibling Markdown companions (Hero.en.md / Hero.no.md) and
	injected by the marte plugin at build time. The text below is a design-time
	preview; marte replaces the inner content of each marked element.

	Markers: `data-marte` on an element, or `<!-- marte -->` before one.
-->
<section class="hero">
	<h1 data-marte>Design-time heading</h1>
	<p data-marte>Design-time tagline, replaced by Markdown.</p>
</section>

<section class="features">
	<h2 data-marte>Features</h2>

	<!-- A bullet list re-skinned from Markdown: the <li> templates' classes are
	     copied (and cycled) onto however many bullets the Markdown provides. -->
	<ul data-marte class="cards">
		<li class="card odd">First feature placeholder</li>
		<li class="card even">Second feature placeholder</li>
	</ul>
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

	.cards {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}

	.card {
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
	}

	.card.odd {
		background: #f4f4f5;
	}

	.card.even {
		background: #e0e7ff;
	}
</style>
