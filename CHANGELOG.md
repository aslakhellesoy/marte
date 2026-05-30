# vite-plugin-marte

## 0.1.0

### Minor Changes

- 1fe64bc: Switch to a positional model. Mark elements with a `data-marte` attribute or a
  `<!-- marte -->` comment (the comment form also works on components); Markdown
  blocks separated by `---` fill the markers in document order — no more
  `:::selector` syntax. Container markers get their rendered Markdown re-skinned
  onto the placeholder markup (recursive `class`/`style` transfer, cycling
  templates for repeated items), baked at build time so scoped CSS applies.
