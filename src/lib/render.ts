import { marked } from 'marked';
import { errAt } from './errors.ts';
import {
	applyInserts,
	childNodes,
	hasElementChild,
	innerRange,
	isElement,
	openTagNameEnd,
	parseSvelte,
	staticAttr,
	type Insert,
	type SvelteNode
} from './svelte-ast.ts';

marked.setOptions({ gfm: true });

// Svelte parses `{` / `}` as expression delimiters, so any literal braces that
// appear in rendered prose must be escaped before the HTML is spliced back into
// a .svelte file (or re-parsed by us).
const escapeBraces = (s: string): string => s.replace(/{/g, '&lbrace;').replace(/}/g, '&rbrace;');

// Presentational attributes copied from placeholder templates onto generated
// elements. Deliberately excludes id (would duplicate on repeats) and any
// Svelte directives / event handlers.
const COPIED_ATTRS = ['class', 'style'] as const;

// Inline/phrasing elements that Markdown produces inside block content (bold,
// links, code…). Style transfer only mirrors *structural* elements, so these
// pass through untouched and never need a matching placeholder template.
const INLINE = new Set([
	'a',
	'abbr',
	'b',
	'bdi',
	'bdo',
	'br',
	'cite',
	'code',
	'data',
	'del',
	'dfn',
	'em',
	'i',
	'img',
	'ins',
	'kbd',
	'mark',
	'q',
	's',
	'samp',
	'small',
	'span',
	'strike',
	'strong',
	'sub',
	'sup',
	'time',
	'u',
	'var',
	'wbr'
]);

/**
 * Render one Markdown block into the inner HTML for a marked element.
 *
 * - A *leaf* placeholder (no child elements — e.g. `<h1>`, `<p>`, `<span>`)
 *   receives inline-rendered Markdown, so no stray `<p>` wrapper is added.
 * - A *container* placeholder (e.g. `<ul>` with `<li>`s, a card with heading +
 *   text) receives block-rendered Markdown, re-skinned onto the placeholder:
 *   `class`/`style` are copied recursively from the template structure, cycling
 *   through sibling templates of the same tag for repeated items. A rendered
 *   element with no matching placeholder tag is a hard error.
 */
export function renderInner(
	blockRaw: string,
	templates: readonly SvelteNode[],
	markedTag: string,
	file: string,
	line: number
): string {
	const text = blockRaw.trim();
	if (text === '') return '';

	if (!hasElementChild(templates)) {
		const html = marked.parseInline(text);
		return escapeBraces(typeof html === 'string' ? html : '').trim();
	}

	let rendered = escapeBraces((marked.parse(text) as string).trim());
	rendered = unwrapMatching(rendered, markedTag);

	const inserts: Insert[] = [];
	mergeStyles(parseSvelte(rendered), templates, inserts, file, line);
	return applyInserts(rendered, inserts).trim();
}

// When the marked element is itself a list/container tag (e.g. `<ul>`), the
// Markdown for it renders a wrapper of the same tag (`<ul><li>…`). Unwrap that
// duplicate so the children (`<li>`) map onto the placeholder's children.
function unwrapMatching(html: string, tag: string): string {
	const els = parseSvelte(html).filter(isElement);
	if (els.length === 1 && els[0].name.toLowerCase() === tag.toLowerCase()) {
		const [s, e] = innerRange(els[0], html);
		return html.slice(s, e).trim();
	}
	return html;
}

function mergeStyles(
	content: readonly SvelteNode[],
	templates: readonly SvelteNode[],
	inserts: Insert[],
	file: string,
	line: number
): void {
	const templateEls = templates.filter(isElement);
	const byTag = new Map<string, SvelteNode[]>();
	for (const t of templateEls) {
		const key = t.name.toLowerCase();
		const list = byTag.get(key) ?? [];
		list.push(t);
		byTag.set(key, list);
	}

	const seen = new Map<string, number>();
	for (const c of content) {
		if (!isElement(c)) continue;
		const tag = c.name.toLowerCase();
		// Inline formatting (em, a, code…) passes through; only structural
		// elements are mapped onto — and required by — the placeholder.
		if (INLINE.has(tag)) continue;
		const tmpls = byTag.get(tag);
		if (!tmpls || tmpls.length === 0) {
			throw errAt(
				file,
				line,
				`rendered <${tag}> has no matching placeholder element to copy styles from` +
					` — the Markdown structure must mirror the component's placeholder markup`
			);
		}
		const i = seen.get(tag) ?? 0;
		seen.set(tag, i + 1);
		const t = tmpls[i % tmpls.length]; // cycle templates for repeated items

		for (const attr of COPIED_ATTRS) {
			const value = staticAttr(t, attr);
			if (value == null) continue;
			if (staticAttr(c, attr) != null) continue; // don't double up an existing attr
			inserts.push({ pos: openTagNameEnd(c), text: ` ${attr}="${value}"` });
		}

		mergeStyles(childNodes(c), childNodes(t), inserts, file, line);
	}
}
