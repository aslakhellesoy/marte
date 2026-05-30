import { renderBlock } from './apply.ts';
import { parseMarkdownBlocks, walkLeaves } from './markdown.ts';

export type MarteEntry = {
	readonly html: string;
	readonly inline: boolean;
};

export type SelectorMap = Record<string, MarteEntry>;

// Walk the parsed marte block tree of a .md file and produce a flat map keyed
// by `walkLeaves`'s selector path. Markdown is rendered to HTML at build time
// (same path as `marte apply`) so the runtime just inlines the strings.
export function buildSelectorMap(mdSource: string, mdFile: string): SelectorMap {
	const blocks = parseMarkdownBlocks(mdSource, mdFile);
	const out: SelectorMap = {};
	walkLeaves(blocks, '', (key, block) => {
		out[key] = { html: renderBlock(block), inline: block.inline };
	});
	return out;
}
