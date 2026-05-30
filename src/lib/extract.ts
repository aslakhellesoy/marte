import { SyncError } from './errors.ts';
import { parseMarkdownBlocks } from './markdown.ts';
import { applyEdits, resolveBlocks } from './apply.ts';
import {
	childNodes,
	findMatches,
	isElement,
	parseSelector,
	parseSvelte,
	staticAttr,
	type SvelteNode
} from './svelte-ast.ts';

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
	'hr'
]);

const LIST_CHILD = new Set(['li']);

type Block = {
	node: SvelteNode;
	selector: string;
	inline: boolean;
	content: string;
};

type Insert = {
	pos: number;
	text: string;
};

const decodeEntities = (s: string): string =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ');

const escInline = (s: string): string => s.replace(/([\\`*_[\]~<])/g, '\\$1');

const escLineStart = (s: string): string =>
	s.replace(/^(\s*)([#>+-])/, '$1\\$2').replace(/^(\s*)(\d+)\./, '$1$2\\.');

const collapseWs = (s: string): string => s.replace(/\s+/g, ' ');

// Minimal selector: tag#id when an id exists, @name when the element already has
// data-marte, otherwise bare tag. Bare tags that turn out ambiguous get a
// data-marte anchor injected (see addMarteAnchors), so the markdown never needs
// positional indices.
function generateSelector(node: SvelteNode): string {
	const id = staticAttr(node, 'id');
	if (id) return `${node.name}#${id}`;
	const marte = staticAttr(node, 'data-marte');
	if (marte) return `@${marte}`;
	return node.name ?? '';
}

function attrIsDynamic(node: SvelteNode, name: string): boolean {
	const attrs = node.attributes ?? [];
	const a = attrs.find((x) => x.type === 'Attribute' && x.name === name);
	if (!a) return false;
	return staticAttr(node, name) === null;
}

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

// Statically serializable if every descendant is inline / markdown-block / list-child,
// no Svelte components, no dynamic nodes, and no link/image carries a dynamic href/src.
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
			const isComponent = /^[A-Z]/.test(n.name);
			if (isComponent || (!INLINE.has(lower) && !MD_BLOCK.has(lower) && !LIST_CHILD.has(lower))) {
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

function extractBlocks(scopeNodes: SvelteNode[], warnings: string[]): Block[] {
	const blocks: Block[] = [];
	for (const n of scopeNodes) {
		if (!isElement(n)) {
			if (n.type && n.type !== 'Text' && n.type !== 'Comment') {
				warnings.push(`skipped dynamic <${n.type}> (not static copy)`);
			} else if (n.type === 'Text' && (n.data ?? '').trim() !== '') {
				warnings.push(
					`stray text "${collapseWs(n.data ?? '')
						.trim()
						.slice(0, 40)}" not captured (mixed with non-static siblings)`
				);
			}
			continue;
		}
		if (!hasText(n)) continue;

		if (isStaticSerializable(n)) {
			const lower = n.name.toLowerCase();
			if (MD_BLOCK.has(lower) || LIST_CHILD.has(lower)) {
				if (/^h[1-6]$/.test(lower) || lower === 'p' || lower === 'li') {
					blocks.push({
						node: n,
						selector: generateSelector(n),
						inline: true,
						content: collapseWs(serializeInline(childNodes(n))).trim()
					});
				} else {
					warnings.push(
						`skipped <${lower}> — wrap it in a container element (e.g. <div>) so its content can be managed`
					);
				}
				continue;
			}
			const hasBlockKids = childNodes(n)
				.filter(isElement)
				.some((c) => MD_BLOCK.has(c.name.toLowerCase()));
			if (hasBlockKids) {
				blocks.push({
					node: n,
					selector: generateSelector(n),
					inline: false,
					content: serializeBlocks(childNodes(n))
				});
			} else {
				blocks.push({
					node: n,
					selector: generateSelector(n),
					inline: true,
					content: collapseWs(serializeInline(childNodes(n))).trim()
				});
			}
		} else {
			blocks.push(...extractBlocks(childNodes(n), warnings));
		}
	}
	return blocks;
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.split(/[\s-]+/)
		.filter(Boolean)
		.slice(0, 5)
		.join('-');
}

// For every block whose selector is a bare tag matching more than one element,
// inject a data-marte="name" anchor onto its element and switch the block to
// address `:::@name`. Returns source insertions for the .svelte.
function addMarteAnchors(blocks: Block[], templateNodes: SvelteNode[], file: string): Insert[] {
	const matchCount = (sel: string): number =>
		findMatches(templateNodes, parseSelector(sel, file, 0)).length;
	const used = new Set(
		blocks.map((b) => (b.selector.startsWith('@') ? b.selector.slice(1) : null)).filter(Boolean)
	);
	const inserts: Insert[] = [];
	let counter = 0;

	for (const b of blocks) {
		const bare = /^[A-Za-z][\w-]*$/.test(b.selector);
		if (!bare || matchCount(b.selector) <= 1) continue;

		const firstLine = (b.content || '').split('\n').find((l) => l.trim()) ?? '';
		const name = slugify(firstLine.replace(/^#+\s*/, '')) || `${b.selector}-${++counter}`;
		let candidate = name;
		let n = 1;
		while (used.has(candidate)) candidate = `${name}-${++n}`;
		used.add(candidate);

		const start = b.node.start ?? 0;
		const tagEnd = start + 1 + (b.node.name?.length ?? 0);
		inserts.push({ pos: tagEnd, text: ` data-marte="${candidate}"` });
		b.selector = `@${candidate}`;
	}
	return inserts;
}

function spliceInserts(source: string, inserts: readonly Insert[]): string {
	let out = source;
	for (const ins of [...inserts].sort((a, b) => b.pos - a.pos)) {
		out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
	}
	return out;
}

function renderMarkdown(blocks: readonly Block[]): string {
	const out: string[] = [];
	for (const b of blocks) {
		out.push(`:::${b.selector}${b.inline ? ' inline' : ''}`);
		if (b.content) out.push(b.content);
		out.push(':::', '');
	}
	return (
		out
			.join('\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim() + '\n'
	);
}

export type GenerateMdResult = {
	md: string;
	svelte: string;
	anchors: number;
};

export function generateMd(svelteSrc: string, file: string, warnings: string[]): GenerateMdResult {
	const nodes = parseSvelte(svelteSrc);
	const blocks = extractBlocks(nodes, warnings);
	if (!blocks.length) return { md: '', svelte: svelteSrc, anchors: 0 };
	const inserts = addMarteAnchors(blocks, nodes, file);
	return {
		md: renderMarkdown(blocks),
		svelte: spliceInserts(svelteSrc, inserts),
		anchors: inserts.length
	};
}

export type ExtractFileResult = {
	mdFile: string;
	md: string;
	svelteFile: string;
	svelte: string;
	svelteChanged: boolean;
	anchors: number;
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
	if (!svelteFile.endsWith('.svelte')) {
		throw new SyncError(`${svelteFile} is not a .svelte file`);
	}
	if (!options.dry && !options.force && options.existing?.(mdFile)) {
		throw new SyncError(`${mdFile} already exists (use --force to overwrite)`);
	}
	const warnings: string[] = [];
	const { md, svelte, anchors } = generateMd(svelteSrc, mdFile, warnings);
	if (!md) throw new SyncError(`no extractable text found in ${svelteFile}`);

	// Self-verify by round-trip against the annotated source.
	let verified = true;
	let verifyMsg = '';
	try {
		const edits = resolveBlocks(
			parseMarkdownBlocks(md, mdFile),
			parseSvelte(svelte),
			svelte,
			mdFile,
			null
		);
		const applied = applyEdits(svelte, edits);
		const md2 = generateMd(applied, mdFile, []).md;
		if (md2 !== md) {
			verified = false;
			verifyMsg = 'content does not survive an apply/extract round-trip';
		}
	} catch (e) {
		verified = false;
		verifyMsg = e instanceof Error ? e.message : String(e);
	}

	const svelteChanged = svelte !== svelteSrc;
	return {
		mdFile,
		md,
		svelteFile,
		svelte,
		svelteChanged,
		anchors,
		warnings,
		verified,
		verifyMsg
	};
}
