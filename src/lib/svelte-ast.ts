import { parse } from 'svelte/compiler';

// The Svelte compiler returns rich AST shapes that we touch loosely. Use a
// permissive node type with the fields we actually care about.
export type SvelteNode = {
	type?: string;
	name?: string;
	data?: string;
	start?: number;
	end?: number;
	fragment?: { nodes?: SvelteNode[] };
	children?: SvelteNode[];
	attributes?: SvelteAttribute[];
	[key: string]: unknown;
};

export type SvelteAttribute = {
	type: string;
	name: string;
	value: true | SvelteAttributeValue | SvelteAttributeValue[];
};

type SvelteAttributeValue = {
	type: string;
	data?: string;
	raw?: string;
};

/** The attribute that marks an element as marte-managed. */
export const MARKER_ATTR = 'data-marte';
/** A leading comment `<!-- marte -->` / `<!-- @marte -->` also marks the next node. */
const MARKER_COMMENT = /^\s*@?marte\s*$/;

export function parseSvelte(source: string): SvelteNode[] {
	type LooseAst = {
		fragment?: { nodes?: SvelteNode[] };
		html?: { children?: SvelteNode[] };
	};
	let ast: LooseAst;
	try {
		ast = parse(source, { modern: true }) as unknown as LooseAst;
	} catch {
		// Fall back for older Svelte
		ast = parse(source) as unknown as LooseAst;
	}
	return ast.fragment?.nodes ?? ast.html?.children ?? [];
}

export function isElement(n: SvelteNode | undefined | null): n is SvelteNode & {
	name: string;
	start: number;
} {
	return (
		!!n &&
		typeof n.name === 'string' &&
		(n.fragment !== undefined || n.children !== undefined) &&
		typeof n.start === 'number'
	);
}

export function childNodes(n: SvelteNode): SvelteNode[] {
	return n.fragment?.nodes ?? n.children ?? [];
}

export function hasElementChild(nodes: readonly SvelteNode[]): boolean {
	return nodes.some(isElement);
}

export function staticAttr(node: SvelteNode, attrName: string): string | null {
	const attrs = node.attributes ?? [];
	const a = attrs.find((x) => x.type === 'Attribute' && x.name === attrName);
	if (!a) return null;
	if (a.value === true) return '';
	const parts = Array.isArray(a.value) ? a.value : [a.value];
	if (!parts.every((p) => p.type === 'Text')) return null;
	return parts.map((p) => p.data ?? p.raw ?? '').join('');
}

export function hasAttr(node: SvelteNode, attrName: string): boolean {
	return (node.attributes ?? []).some((a) => a.type === 'Attribute' && a.name === attrName);
}

/**
 * Walk the AST in document order and return the marte-marked elements — those
 * carrying `data-marte`, or immediately preceded by a `<!-- marte -->` comment
 * (the comment form works on Svelte components too, where an attribute would be
 * a type error). A marked element is NOT descended into: its whole inner content
 * belongs to its companion Markdown block.
 */
export function collectMarkers(nodes: readonly SvelteNode[]): SvelteNode[] {
	const out: SvelteNode[] = [];
	const walk = (list: readonly SvelteNode[]): void => {
		let pending = false;
		for (const n of list) {
			if (n.type === 'Comment') {
				if (MARKER_COMMENT.test(String(n.data ?? ''))) pending = true;
				continue;
			}
			if (!isElement(n)) {
				// Whitespace between a comment and its element keeps the marker live.
				if (n.type === 'Text' && String(n.data ?? '').trim() === '') continue;
				pending = false;
				continue;
			}
			if (pending || hasAttr(n, MARKER_ATTR)) {
				out.push(n);
				pending = false;
				continue; // do not descend into a marked element
			}
			walk(childNodes(n));
		}
	};
	walk(nodes);
	return out;
}

// Inner-content character range of an element (between > and </tag>).
export function innerRange(node: SvelteNode, source: string): readonly [number, number] {
	const kids = childNodes(node);
	if (kids.length) {
		const first = kids[0];
		const last = kids[kids.length - 1];
		if (typeof first.start === 'number' && typeof last.end === 'number') {
			return [first.start, last.end];
		}
	}
	// Empty element: locate end of open tag and start of close tag in the source.
	const start = node.start ?? 0;
	const end = node.end ?? start;
	const slice = source.slice(start, end);
	const openEnd = findOpenTagEnd(slice);
	const closeStart = slice.lastIndexOf('</');
	if (openEnd < 0 || closeStart < 0 || closeStart < openEnd) {
		return [start + Math.max(openEnd, 0), start + Math.max(openEnd, 0)];
	}
	return [start + openEnd, start + closeStart];
}

// index just past the first unquoted `>` (end of the opening tag)
export function findOpenTagEnd(slice: string): number {
	let quote: string | null = null;
	for (let i = 0; i < slice.length; i++) {
		const ch = slice[i];
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") quote = ch;
		else if (ch === '>') return i + 1;
	}
	return -1;
}

/** Character offset just past the open tag name, i.e. where attributes go. */
export function openTagNameEnd(node: SvelteNode): number {
	return (node.start ?? 0) + 1 + (node.name?.length ?? 0);
}

export function leadingIndent(source: string, pos: number): string {
	const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
	const m = source.slice(lineStart, pos).match(/^\s*/);
	return m ? m[0] : '';
}

export type Insert = { readonly pos: number; readonly text: string };

/** Apply position-based string insertions (right-to-left so offsets stay valid). */
export function applyInserts(source: string, inserts: readonly Insert[]): string {
	let out = source;
	for (const ins of [...inserts].sort((a, b) => b.pos - a.pos)) {
		out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
	}
	return out;
}
