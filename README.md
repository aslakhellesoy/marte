# marte

**Two-way sync between MARkdown and svelTE.**

Keep your page _copy_ in Markdown. Keep your _design_ in Svelte. `marte` injects
the Markdown into your components at build time, so the text you read and edit
lives in one clean, ordered file — while your layout stays untouched.

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

Markdown contains `:::` markers followed by a **selector** that tells `marte`
which element to fill:

**`Hero.md`**

```markdown
:::section.hero
:::h1 inline
Build content-driven Svelte sites
:::
:::p inline
Edit the **Markdown**. Watch the component update.
:::
:::
```

**`Hero.svelte`** — your design, with placeholder text for previewing:

```svelte
<section class="hero">
	<h1>Design-time heading</h1>
	<p>Design-time copy.</p>
</section>
```

At build time `marte` renders the Markdown and injects it into the matching
elements. The `<h1>` and `<p>` get the real copy; everything else — classes,
structure, styles — is yours.

## Selectors

A selector addresses an element CSS-style:

| Selector              | Matches                                      |
| --------------------- | -------------------------------------------- |
| `h1`                  | a `<h1>`                                      |
| `section.hero`        | `<section class="hero">`                     |
| `h2#intro`            | `<h2 id="intro">`                            |
| `@cta`                | the element with `data-marte="cta"`          |
| `section.hero#top@x`  | tag + class + id + `data-marte`, combined     |

- Add ` inline` after a selector for inline content (no wrapping `<p>`).
- **Nest** blocks to mirror your component's structure — children resolve within
  the parent's scope.
- A selector must match **exactly as many elements as it has blocks**. If a bare
  tag is ambiguous, give the element a `data-marte="name"` (then address `:::@name`)
  or an `id`.

### Fail loudly

A selector that matches nothing, the wrong number of elements, two blocks
claiming the same element, or overlapping targets is a **hard error** with a
non-zero exit code. Mistakes surface at build / CI / pre-commit time, never as
silently dropped copy.

## Install

```sh
pnpm add -D vite-plugin-marte
```

`marte` is a Vite plugin. Add it to `vite.config.ts` **before** the Svelte
plugin:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { marte } from 'vite-plugin-marte';

export default defineConfig({
	plugins: [marte(), sveltekit()]
});
```

That's it. Any `Foo.svelte` with a sibling `Foo.md` is now content-managed, with
**HMR**: edit the Markdown and the page reloads.

## Internationalization

`marte` complements i18n libraries like
[Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) and
sveltia-i18n by keeping localized **prose** in Markdown. (i18n libraries are
great for buttons, labels and menus — less so for paragraphs.)

Pass two or more locales and a `runtimeLocale` accessor. Each component then
pairs with one companion per locale (`Hero.en.md`, `Hero.no.md`, …), and `marte`
selects the right one at render time:

```ts
marte({
	locales: ['en', 'no'],
	baseLocale: 'en',
	runtimeLocale: {
		// injected verbatim into the component's <script>
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

`marte` validates that every locale's companion defines the **same selectors**,
so a translation can't silently drift out of sync.

## CLI

```
marte extract <file|dir|glob>   bootstrap a Markdown companion from a .svelte file
marte check   [--dir src]       validate that every selector resolves. No writes.
marte apply   [--dir src]       validate, then write injected content into .svelte
```

- `extract` reads your component's static prose into Markdown and auto-injects
  `data-marte` anchors to disambiguate repeated elements. It self-verifies with
  an extract → apply → extract round-trip.
- `check` is CI-friendly: it fails loudly if anything doesn't line up.
- `--locale <L>` selects the `.L.md` extension (default `no`); `--ext` overrides.

```sh
pnpm marte check --dir src
```

## How it compares

[**mdsvex**](https://mdsvex.pngwn.io/) lets you use Svelte components _inside_
Markdown — ideal for blog posts. `marte` is the inverse: it _extracts_ prose
_out of_ Svelte components into Markdown, which suits the rich, bespoke layouts
of landing pages and marketing sites where mdsvex falls short.

## Credits

All of `marte`'s code was written by Claude Code. It took a human to come up
with the idea, the UX, the DX, and the syntax — a.k.a. _intuition_.

## License

MIT
