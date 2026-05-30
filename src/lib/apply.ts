import { marked } from 'marked';
import { errAt, SyncError } from './errors.ts';
import type { MarkdownBlock } from './markdown.ts';
import {
	childNodes,
	findMatches,
	innerRange,
	leadingIndent,
	parseSelector,
	type SvelteNode
} from './svelte-ast.ts';

marked.setOptions({ gfm: true });

export type Edit = {
	readonly start: number;
	readonly end: number;
	readonly replacement: string;
};

export function renderBlock(block: MarkdownBlock): string {
	const text = block.ownLines.join('\n').trim();
	const html = block.inline ? marked.parseInline(text) : marked.parse(text);
	const out = typeof html === 'string' ? html : '';
	// Protect Svelte's mustache syntax: literal braces in content must not be
	// parsed as expressions once injected into a .svelte file.
	return out.replace(/{/g, '&lbrace;').replace(/}/g, '&rbrace;').trim();
}

export function resolveBlocks(
	blocks: readonly MarkdownBlock[],
	scopeNodes: readonly SvelteNode[],
	source: string,
	file: string,
	scopeLabel: string | null
): Edit[] {
	const edits: Edit[] = [];
	const claimed = new Map<SvelteNode, string>();
	const where = scopeLabel ? ` within ${scopeLabel}` : '';

	const emit = (block: MarkdownBlock, node: SvelteNode): void => {
		if (claimed.has(node)) {
			throw errAt(
				file,
				block.line,
				`element targeted by \`${block.selector}\` is also targeted by \`${claimed.get(node)}\``
			);
		}
		claimed.set(node, block.selector ?? '');
		if (block.children.length) {
			edits.push(
				...resolveBlocks(block.children, childNodes(node), source, file, `\`${block.selector}\``)
			);
			return;
		}
		const [start, end] = innerRange(node, source);
		if (typeof node.start !== 'number') return;
		const indent = leadingIndent(source, node.start);
		const body = renderBlock(block);
		const replacement = body
			? `\n${indent}  ${body.split('\n').join(`\n${indent}  `)}\n${indent}`
			: '';
		edits.push({ start, end, replacement });
	};

	const groups = new Map<string, MarkdownBlock[]>();
	for (const b of blocks) {
		const key = b.selector ?? '';
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)?.push(b);
	}

	for (const [selector, sibs] of groups) {
		const parsed = parseSelector(selector, file, sibs[0].line);
		const matches = findMatches([...scopeNodes], parsed);
		if (matches.length === 0) {
			throw errAt(file, sibs[0].line, `selector \`${selector}\` matches no element${where}`);
		}
		if (matches.length !== sibs.length) {
			throw errAt(
				file,
				sibs[0].line,
				`selector \`${selector}\` matches ${matches.length} element(s) but the markdown has ${sibs.length} block(s)${where}` +
					` — give the element(s) a data-marte="name" (then address \`:::@name\`) or an id to disambiguate`
			);
		}
		sibs.forEach((block, i) => emit(block, matches[i]));
	}

	return edits;
}

export function applyEdits(source: string, edits: readonly Edit[]): string {
	const sorted = [...edits].sort((a, b) => a.start - b.start);
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].start < sorted[i - 1].end) {
			throw new SyncError(
				'overlapping injection targets — markdown nesting does not mirror the component structure'
			);
		}
	}
	let out = source;
	for (const e of [...edits].sort((a, b) => b.start - a.start)) {
		out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
	}
	return out;
}
