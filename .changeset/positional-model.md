---
'vite-plugin-malte': minor
---

Switch to a positional model. Mark elements with a `data-malte` attribute or a
`<!-- malte -->` comment (the comment form also works on components); Markdown
blocks separated by `---` fill the markers in document order — no more
`:::selector` syntax. Container markers get their rendered Markdown re-skinned
onto the placeholder markup (recursive `class`/`style` transfer, cycling
templates for repeated items), baked at build time so scoped CSS applies.
