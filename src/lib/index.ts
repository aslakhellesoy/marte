export { SyncError, errAt } from './errors.ts';
export { parseMarkdownBlocks, walkLeaves } from './markdown.ts';
export type { MarkdownBlock } from './markdown.ts';
export {
	parseSvelte,
	isElement,
	childNodes,
	staticAttr,
	elementClasses,
	parseSelector,
	nodeMatches,
	findMatches,
	innerRange,
	findOpenTagEnd,
	leadingIndent
} from './svelte-ast.ts';
export type { SvelteNode, SvelteAttribute, ParsedSelector } from './svelte-ast.ts';
export { renderBlock, resolveBlocks, applyEdits } from './apply.ts';
export type { Edit } from './apply.ts';
export { buildSelectorMap } from './build-map.ts';
export type { MarteEntry, SelectorMap } from './build-map.ts';
export { resolveTargets, transformSvelteSource } from './transform.ts';
export type { ResolvedTarget, RuntimeConfig } from './transform.ts';
export { generateMd, extractFromSource } from './extract.ts';
export type { ExtractFileResult, ExtractOptions, GenerateMdResult } from './extract.ts';
export { marte } from './vite.ts';
export type { MarteOptions, RuntimeLocale } from './vite.ts';
export { runCli } from './cli.ts';
