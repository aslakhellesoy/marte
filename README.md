# marte

**Two-way sync between MARkdown and svelTE.**

Keep your page _copy_ in Markdown. Keep your _design_ in Svelte. `marte` injects
the Markdown into your components at build time, so the text you read and edit
lives in one clean, ordered file — while your layout, classes and styles stay
untouched.

```
Hero.svelte   ← design & layout (you keep this)
Hero.md       ← the words (edit these)
```

---

## The problem

Svelte pages with rich layouts usually source their copy from one of:

- **Inline, hardcoded in `.svelte`** — great until you want editorial control,
  and the prose ends up tangled in markup.
- **A CMS** (Sanity, Contentful, …) — powerful, but now your copy lives in a
  different system entirely.
- **i18n JSON files** — every paragraph becomes a key, scattered among hundreds
  of unrelated entries (button labels, menus, errors…).

The last two share a problem: **fragmentation**. The paragraphs of a single page
are spread across many places, in no particular order. You can't read the page
as prose, which is exactly what you need to do to _write_ good prose.

It's also painful for an LLM to copyedit. To understand the flow of a page it
has to reassemble it from a JSON file _and_ the markup — burning tokens and
context just to find the words.

## The idea

With `marte`, each component has a Markdown companion that reads top-to-bottom
like the page itself. A human or an agent edits the Markdown; the design never
moves.

You **mark** the elements whose content comes from Markdown, and the Markdown is
a sequence of blocks separated by `---`. The Nth block fills the Nth marker — no
selectors, no ids, no special syntax.

**`Hero.svelte`** — your design, with placeholder text for previewing:

```svelte
<section class="hero">
	<h1 data-marte>Design-time heading</h1>
	<p data-marte>Design-time tagline.</p>
</section>
```

**`Hero.md`** — the real copy, in order:

```markdown
Build content-driven Svelte sites

---

Edit the **Markdown**. Watch the component update.
```

At build time `marte` renders each block and injects it into the matching
element. The `<h1>` and `<p>` get the real copy; everything else — classes,
structure, styles — is yours.

## Marking elements

Two equivalent markers, matched **positionally** in document order:

```svelte
<!-- A boolean attribute on any HTML element -->
<h1 data-marte>…</h1>

<!-- A comment before any node — works on components too,
     where an attribute would be a TypeScript error -->
<!-- marte -->
<Card>…</Card>
```

A marked element is never descended into — its whole inner content belongs to its
block. Mark a leaf (`<h1>`, `<p>`, `<span>`) for a single run of text; mark a
container (`<section>`, a card, a `<ul>`) to fill a richer structure.

## Style transfer

When a block targets a **container**, `marte` renders the Markdown to HTML and
**re-skins it onto your placeholder markup**, copying `class` and `style`
recursively. A styled list template becomes as many styled items as the Markdown
has bullets — cycling through your `<li>` templates:

```svelte
<ul data-marte class="cards">
	<li class="card odd">…</li>
	<li class="card even">…</li>
</ul>
```

```markdown
- First feature
- Second feature
- Third feature
- Fourth feature
- Fifth feature
```

→ five `<li>`s with classes `odd, even, odd, even, odd`. Because the markup is
baked at build time, Svelte's **scoped CSS applies to the generated content**
just like hand-written markup. If the Markdown structure can't be mapped onto the
placeholder (e.g. a paragraph where a list is expected), that's a hard error.

## Install

```sh
pnpm add -D vite-plugin-marte
```

Add it to `vite.config.ts` **before** the Svelte plugin:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { marte } from 'vite-plugin-marte';

export default defineConfig({
	plugins: [marte(), sveltekit()]
});
```

Any `Foo.svelte` with a sibling `Foo.md` is now content-managed, with **HMR**:
edit the Markdown and the page reloads.

## Internationalization

`marte` complements i18n libraries like
[Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) and
sveltia-i18n by keeping localized **prose** in Markdown. (i18n libraries are
great for buttons, labels and menus — less so for paragraphs.)

Pass two or more locales and a `runtimeLocale` accessor; each component then
pairs with one companion per locale (`Hero.en.md`, `Hero.no.md`, …). Every locale
is baked behind an `{#if}` branch, so switching locale is reactive and fully
styled:

```ts
marte({
	locales: ['en', 'no'],
	baseLocale: 'en',
	runtimeLocale: {
		importStatement: "import { getLocale } from '$lib/i18n';",
		expression: 'getLocale()'
	}
});
```

Using Paraglide? Point `marte` at your project and it wires up the locale list
and runtime for you:

```ts
marte({ paraglideProject: './project.inlang' });
```

Companions for every locale must define the same number of blocks, so a
translation can't silently drift out of sync.

## CLI

```
marte extract <file|dir|glob>   bootstrap a Markdown companion from a .svelte file
marte check   [--dir src]       validate that markers and blocks line up. No writes.
marte apply   [--dir src]       validate, then bake the content into .svelte
```

- `extract` adds `data-marte` markers to a component's static prose and writes the
  matching Markdown, self-verifying with a round-trip.
- `check` is CI-friendly: it fails loudly if counts or structure don't match.
- `--locale <L>` selects the `.L.md` extension; `--ext` overrides (default `.md`).

```sh
pnpm marte check --dir src
```

## How it compares

[**mdsvex**](https://mdsvex.pngwn.io/) lets you use Svelte components _inside_
Markdown — ideal for blog posts. `marte` is the inverse: it keeps prose _out of_
your components in Markdown and injects it back, which suits the rich, bespoke
layouts of landing pages and marketing sites where mdsvex falls short.

## Philosophy

Fail loudly. A marker with no block, a block with no marker, or a Markdown
structure that doesn't fit the placeholder is a hard error with a non-zero exit
code — friendly for CI and pre-commit hooks.

## Credits

All of `marte`'s code was written by Claude Code. It took a human to come up
with the idea, the UX, the DX, and the syntax — a.k.a. _intuition_.

## License

MIT
