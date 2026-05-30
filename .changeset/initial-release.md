---
'vite-plugin-marte': minor
---

Initial release: a Vite plugin and CLI for two-way sync between Markdown and
Svelte. Authors keep page prose in a Markdown companion file (`Hero.md` next to
`Hero.svelte`); marte injects the rendered HTML into the elements addressed by
`:::selector` blocks at build time. Includes single-locale and i18n modes, HMR
on Markdown edits, and `marte check` / `apply` / `extract` CLI commands.
