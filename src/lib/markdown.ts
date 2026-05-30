// marte's Markdown format is deliberately plain: a file is a sequence of
// content blocks separated by a thematic break (`---` on its own line). Each
// block is ordinary Markdown and maps, by position, to the Nth marked element
// in the companion `.svelte` file. There are no selectors, ids or `:::` fences.

export type Block = {
	/** The raw Markdown of this block (trimmed). */
	readonly raw: string;
	/** 1-based line number where the block starts, for error messages. */
	readonly line: number;
};

const SEPARATOR = /^-{3,}\s*$/;

export function parseBlocks(md: string): Block[] {
	const lines = md.split(/\r?\n/);
	const blocks: Block[] = [];
	let current: string[] = [];
	let startLine = 1;

	const flush = (): void => {
		blocks.push({ raw: current.join('\n').trim(), line: startLine });
		current = [];
	};

	lines.forEach((line, i) => {
		if (SEPARATOR.test(line)) {
			flush();
			startLine = i + 2;
		} else {
			current.push(line);
		}
	});
	flush();

	// A leading or trailing separator produces an empty edge block; drop those
	// so the count reflects real content. Empty blocks *between* separators are
	// kept — they intentionally clear an element.
	while (blocks.length && blocks[0].raw === '') blocks.shift();
	while (blocks.length && blocks[blocks.length - 1].raw === '') blocks.pop();
	return blocks;
}
