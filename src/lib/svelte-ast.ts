import { parse } from 'svelte/compiler';
import { errAt } from './errors.ts';

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

export type ParsedSelector = {
	readonly tag: string | null;
	readonly classes: ReadonlySet<string>;
	readonly id: string | null;
	readonly marte: string | null;
	readonly raw: string;
};

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

export function staticAttr(node: SvelteNode, attrName: string): string | null {
	const attrs = node.attributes ?? [];
	const a = attrs.find((x) => x.type === 'Attribute' && x.name === attrName);
	if (!a) return null;
	if (a.value === true) return '';
	const parts = Array.isArray(a.value) ? a.value : [a.value];
	if (!parts.every((p) => p.type === 'Text')) return null;
	return parts.map((p) => p.data ?? p.raw ?? '').join('');
}

export function elementClasses(node: SvelteNode): Set<string> {
	const classes = new Set<string>();
	const cls = staticAttr(node, 'class');
	if (cls)
		cls
			.split(/\s+/)
			.filter(Boolean)
			.forEach((c) => classes.add(c));
	for (const a of node.attributes ?? []) {
		if (a.type === 'ClassDirective' || a.type === 'Class') classes.add(a.name);
	}
	return classes;
}

// Parse "section.hero#top" or "@hero-intro" or "p@hero" -> { tag, classes, id, marte }.
// `@name` matches the element carrying data-marte="name".
export function parseSelector(sel: string, file: string, line: number): ParsedSelector {
	const m = sel.match(/^([a-zA-Z][\w-]*)?((?:[.#@][\w-]+)*)$/);
	if (!m) throw errAt(file, line, `invalid selector \`${sel}\``);
	const tag = m[1] || null;
	const classes = new Set<string>();
	let id: string | null = null;
	let marte: string | null = null;
	for (const tok of m[2].matchAll(/([.#@])([\w-]+)/g)) {
		if (tok[1] === '.') classes.add(tok[2]);
		else if (tok[1] === '#') id = tok[2];
		else marte = tok[2];
	}
	return { tag, classes, id, marte, raw: sel };
}

export function nodeMatches(node: SvelteNode, parsed: ParsedSelector): boolean {
	if (!isElement(node)) return false;
	if (parsed.tag && node.name.toLowerCase() !== parsed.tag.toLowerCase()) return false;
	if (parsed.id != null && staticAttr(node, 'id') !== parsed.id) return false;
	if (parsed.marte != null && staticAttr(node, 'data-marte') !== parsed.marte) return false;
	if (parsed.classes.size) {
		const have = elementClasses(node);
		for (const c of parsed.classes) if (!have.has(c)) return false;
	}
	return true;
}

export function findMatches(scopeNodes: SvelteNode[], parsed: ParsedSelector): SvelteNode[] {
	const out: SvelteNode[] = [];
	const visit = (nodes: SvelteNode[]): void => {
		for (const n of nodes) {
			if (!isElement(n)) continue;
			if (nodeMatches(n, parsed)) out.push(n);
			visit(childNodes(n));
		}
	};
	visit(scopeNodes);
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

export function leadingIndent(source: string, pos: number): string {
	const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
	const m = source.slice(lineStart, pos).match(/^\s*/);
	return m ? m[0] : '';
}
