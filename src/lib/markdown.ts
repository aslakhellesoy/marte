import { errAt } from './errors.ts';

export type MarkdownBlock = {
	readonly selector: string | null;
	readonly inline: boolean;
	readonly ownLines: string[];
	readonly children: MarkdownBlock[];
	readonly line: number;
};

const OPEN_RE = /^(:{3,})\s*([^:\s].*?)\s*$/;
const CLOSE_RE = /^:{3,}\s*$/;

export function parseMarkdownBlocks(md: string, file: string): readonly MarkdownBlock[] {
	const lines = md.split(/\r?\n/);
	const root: MarkdownBlock = {
		selector: null,
		inline: false,
		ownLines: [],
		children: [],
		line: 0
	};
	const stack: MarkdownBlock[] = [root];

	lines.forEach((raw, i) => {
		const lineNo = i + 1;
		const open = raw.match(OPEN_RE);
		const close = !open && CLOSE_RE.test(raw);
		const top = stack[stack.length - 1];

		if (open) {
			const tokens = open[2].split(/\s+/);
			const selector = tokens[0];
			const inline = tokens.slice(1).includes('inline');
			const block: MarkdownBlock = {
				selector,
				inline,
				ownLines: [],
				children: [],
				line: lineNo
			};
			top.children.push(block);
			stack.push(block);
		} else if (close) {
			if (stack.length === 1) throw errAt(file, lineNo, 'closing ::: with no open block');
			stack.pop();
		} else {
			top.ownLines.push(raw);
		}
	});

	if (stack.length !== 1) {
		const unclosed = stack[stack.length - 1];
		throw errAt(file, unclosed.line, `block \`${unclosed.selector}\` is never closed`);
	}

	validateBlockTree(root, file);
	return root.children;
}

/**
 * Walk a parsed block tree depth-first in source order, invoking `visit` for
 * every leaf block with the stable key derived from its path. Sibling blocks
 * that share a selector receive a `[index]` suffix; selectors unique within
 * their scope use their bare form. The same key derivation runs on both the
 * load side (`buildSelectorMap`) and the transform side (`resolveTargets`).
 */
export function walkLeaves(
	blocks: readonly MarkdownBlock[],
	prefix: string,
	visit: (key: string, block: MarkdownBlock) => void
): void {
	const counts = new Map<string, number>();
	for (const b of blocks) {
		if (!b.selector) continue;
		counts.set(b.selector, (counts.get(b.selector) ?? 0) + 1);
	}
	const seen = new Map<string, number>();
	for (const b of blocks) {
		if (!b.selector) continue;
		const total = counts.get(b.selector) ?? 1;
		const i = seen.get(b.selector) ?? 0;
		seen.set(b.selector, i + 1);
		const indexed = total > 1 ? `${b.selector}[${i}]` : b.selector;
		const key = prefix ? `${prefix}/${indexed}` : indexed;
		if (b.children.length) walkLeaves(b.children, key, visit);
		else visit(key, b);
	}
}

function validateBlockTree(root: MarkdownBlock, file: string): void {
	const hasProse = (b: MarkdownBlock) => b.ownLines.some((l) => l.trim() !== '');
	const walk = (b: MarkdownBlock, isRoot: boolean): void => {
		if (!isRoot && b.children.length && hasProse(b)) {
			throw errAt(
				file,
				b.line,
				`block \`${b.selector}\` mixes prose and child blocks; a block must be either a leaf (prose) or a container (child blocks)`
			);
		}
		if (isRoot && hasProse(b)) {
			const firstProse = b.ownLines.findIndex((l) => l.trim() !== '');
			throw errAt(file, firstProse + 1, 'content outside of any ::: block');
		}
		b.children.forEach((c) => walk(c, false));
	};
	walk(root, true);
}
