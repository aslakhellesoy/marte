import { SyncError } from './errors.ts';
import {
	applyInserts,
	childNodes,
	collectMarkers,
	hasAttr,
	hasElementChild,
	isElement,
	MARKER_ATTR,
	openTagNameEnd,
	parseSvelte,
	staticAttr,
	type Insert,
	type SvelteNode
} from './svelte-ast.ts';
import { checkSvelteSource } from './transform.ts';

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

const MD_BLOCK = new Set([
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'ul',
	'ol',
	'blockquote',
	'pre',
	'hr',
	'li'
]);

const decodeEntities = (s: string): string =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lbrace;/g, '{')
		.replace(/&rbrace;/g, '}')
		.replace(/&nbsp;/g, ' ');

const escInline = (s: string): string => s.replace(/([\\`*_[\]~<])/g, '\\$1');
const escLineStart = (s: string): string =>
	s.replace(/^(\s*)([#>+-])/, '$1\\$2').replace(/^(\s*)(\d+)\./, '$1$2\\.');
const collapseWs = (s: string): string => s.replace(/\s+/g, ' ');

function rawText(nodes: SvelteNode[]): string {
	let s = '';
	for (const n of nodes) {
		if (n.type === 'Text') s += n.data ?? '';
		else if (isElement(n)) s += rawText(childNodes(n));
	}
	return decodeEntities(s);
}

function serializeInline(nodes: SvelteNode[]): string {
	let out = '';
	for (const n of nodes) {
		if (n.type === 'Text') {
			out += escInline(collapseWs(decodeEntities(n.data ?? '')));
			continue;
		}
		if (!isElement(n)) continue;
		const name = n.name.toLowerCase();
		const inner = serializeInline(childNodes(n));
		switch (name) {
			case 'em':
			case 'i':
				out += `*${inner}*`;
				break;
			case 'strong':
			case 'b':
				out += `**${inner}**`;
				break;
			case 'del':
			case 's':
			case 'strike':
				out += `~~${inner}~~`;
				break;
			case 'code':
				out += `\`${rawText(childNodes(n))}\``;
				break;
			case 'br':
				out += '  \n';
				break;
			case 'a':
				out += `[${inner}](${staticAttr(n, 'href') ?? ''})`;
				break;
			case 'img':
				out += `![${staticAttr(n, 'alt') ?? ''}](${staticAttr(n, 'src') ?? ''})`;
				break;
			default:
				out += inner;
		}
	}
	return out;
}

function serializeList(node: SvelteNode, ordered: boolean): string {
	const items = childNodes(node).filter((c) => isElement(c) && c.name.toLowerCase() === 'li');
	return items
		.map((li, i) => {
			const marker = ordered ? `${i + 1}. ` : '- ';
			const inner = serializeBlocks(childNodes(li)) || '';
			const [first, ...rest] = inner.split('\n');
			return marker + first + rest.map((l) => (l ? `\n  ${l}` : '\n')).join('');
		})
		.join('\n');
}

function serializeBlocks(nodes: SvelteNode[]): string {
	const blocks: string[] = [];
	let pending: SvelteNode[] = [];
	const flush = (): void => {
		if (!pending.length) return;
		const s = collapseWs(serializeInline(pending)).trim();
		if (s) blocks.push(escLineStart(s));
		pending = [];
	};
	for (const n of nodes) {
		if (n.type === 'Text') {
			if ((n.data ?? '').trim() !== '' || pending.length) pending.push(n);
			continue;
		}
		if (!isElement(n)) continue;
		const name = n.name.toLowerCase();
		if (INLINE.has(name)) {
			pending.push(n);
			continue;
		}
		flush();
		if (/^h[1-6]$/.test(name)) {
			blocks.push(
				`${'#'.repeat(Number(name[1]))} ${collapseWs(serializeInline(childNodes(n))).trim()}`
			);
		} else if (name === 'p') {
			const s = collapseWs(serializeInline(childNodes(n))).trim();
			if (s) blocks.push(escLineStart(s));
		} else if (name === 'ul') blocks.push(serializeList(n, false));
		else if (name === 'ol') blocks.push(serializeList(n, true));
		else if (name === 'blockquote') {
			blocks.push(
				serializeBlocks(childNodes(n))
					.split('\n')
					.map((l) => `> ${l}`)
					.join('\n')
			);
		} else if (name === 'pre') {
			blocks.push('```\n' + rawText(childNodes(n)).replace(/\n+$/, '') + '\n```');
		} else if (name === 'hr') blocks.push('---');
		else {
			const s = serializeBlocks(childNodes(n));
			if (s) blocks.push(s);
		}
	}
	flush();
	return blocks.filter(Boolean).join('\n\n');
}

function hasText(node: SvelteNode): boolean {
	let found = false;
	const visit = (nodes: SvelteNode[]): void => {
		for (const n of nodes) {
			if (found) return;
			if (n.type === 'Text') {
				if ((n.data ?? '').trim() !== '') found = true;
			} else if (isElement(n)) visit(childNodes(n));
		}
	};
	visit(childNodes(node));
	return found;
}

function attrIsDynamic(node: SvelteNode, name: string): boolean {
	const attrs = node.attributes ?? [];
	const a = attrs.find((x) => x.type === 'Attribute' && x.name === name);
	if (!a) return false;
	return staticAttr(node, name) === null;
}

// Serializable if every descendant is inline / markdown-block, no Svelte
// components, no dynamic nodes, and no link/image has a dynamic href/src.
function isStaticSerializable(node: SvelteNode): boolean {
	let ok = true;
	const visit = (nodes: SvelteNode[]): void => {
		for (const n of nodes) {
			if (!ok) return;
			if (n.type === 'Text' || n.type === 'Comment') continue;
			if (!isElement(n)) {
				ok = false;
				return;
			}
			const lower = n.name.toLowerCase();
			if (/^[A-Z]/.test(n.name) || (!INLINE.has(lower) && !MD_BLOCK.has(lower))) {
				ok = false;
				return;
			}
			if (
				(lower === 'a' && attrIsDynamic(n, 'href')) ||
				(lower === 'img' && attrIsDynamic(n, 'src'))
			) {
				ok = false;
				return;
			}
			visit(childNodes(n));
		}
	};
	visit(childNodes(node));
	return ok;
}

// Bootstrap: pick the outermost static, text-bearing elements to mark. Descends
// past components/dynamic wrappers to find markable content beneath them.
function findBootstrapTargets(nodes: SvelteNode[], warnings: string[], out: SvelteNode[]): void {
	for (const n of nodes) {
		if (!isElement(n)) {
			if (n.type && n.type !== 'Text' && n.type !== 'Comment') {
				warnings.push(`skipped dynamic <${n.type}> (not static copy)`);
			}
			continue;
		}
		if (!hasText(n)) continue;
		if (isStaticSerializable(n)) out.push(n);
		else findBootstrapTargets(childNodes(n), warnings, out);
	}
}

function serializeTarget(node: SvelteNode): string {
	const kids = childNodes(node);
	if (hasElementChild(kids)) return serializeBlocks(kids);
	return collapseWs(serializeInline(kids)).trim();
}

export type GenerateMdResult = { md: string; svelte: string; markersAdded: number };

export function generateMd(svelteSrc: string, warnings: string[]): GenerateMdResult {
	const nodes = parseSvelte(svelteSrc);
	let targets: SvelteNode[] = collectMarkers(nodes).map((m) =>
		m.kind === 'each' ? m.template : m.node
	);
	const inserts: Insert[] = [];

	if (targets.length === 0) {
		const found: SvelteNode[] = [];
		findBootstrapTargets(nodes, warnings, found);
		for (const node of found) {
			if (!hasAttr(node, MARKER_ATTR))
				inserts.push({ pos: openTagNameEnd(node), text: ` ${MARKER_ATTR}` });
		}
		targets = found;
	}

	if (targets.length === 0) return { md: '', svelte: svelteSrc, markersAdded: 0 };

	const md = targets.map(serializeTarget).filter(Boolean).join('\n\n---\n\n').trim() + '\n';
	return { md, svelte: applyInserts(svelteSrc, inserts), markersAdded: inserts.length };
}

export type ExtractFileResult = {
	mdFile: string;
	md: string;
	svelteFile: string;
	svelte: string;
	svelteChanged: boolean;
	markersAdded: number;
	warnings: string[];
	verified: boolean;
	verifyMsg: string;
};

export type ExtractOptions = {
	readonly force?: boolean;
	readonly dry?: boolean;
	readonly existing?: (path: string) => boolean;
};

export function extractFromSource(
	svelteFile: string,
	svelteSrc: string,
	mdFile: string,
	options: ExtractOptions = {}
): ExtractFileResult {
	if (!svelteFile.endsWith('.svelte')) throw new SyncError(`${svelteFile} is not a .svelte file`);
	if (!options.dry && !options.force && options.existing?.(mdFile)) {
		throw new SyncError(`${mdFile} already exists (use --force to overwrite)`);
	}
	const warnings: string[] = [];
	const { md, svelte, markersAdded } = generateMd(svelteSrc, warnings);
	if (!md) throw new SyncError(`no extractable text found in ${svelteFile}`);

	let verified = true;
	let verifyMsg = '';
	try {
		checkSvelteSource(svelte, md, mdFile);
	} catch (e) {
		verified = false;
		verifyMsg = e instanceof Error ? e.message : String(e);
	}

	return {
		mdFile,
		md,
		svelteFile,
		svelte,
		svelteChanged: svelte !== svelteSrc,
		markersAdded,
		warnings,
		verified,
		verifyMsg
	};
}
