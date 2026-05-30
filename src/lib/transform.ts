import { applyEdits, type Edit } from './apply.ts';
import { errAt } from './errors.ts';
import { parseMarkdownBlocks, type MarkdownBlock } from './markdown.ts';
import {
	childNodes,
	findMatches,
	innerRange,
	leadingIndent,
	parseSelector,
	parseSvelte,
	type SvelteNode
} from './svelte-ast.ts';

export type ResolvedTarget = {
	readonly node: SvelteNode;
	readonly key: string;
	readonly inline: boolean;
};

/**
 * How the transformed component should obtain its content at runtime.
 *
 * - `{ i18n: false }` — single-locale: the virtual `marteContent` is the
 *   selector map directly and no locale accessor is imported.
 * - `{ i18n: true, ... }` — multi-locale: the virtual `marteContent` is keyed
 *   by locale. `importStatement` brings a `getLocale`-style accessor into
 *   scope, and `expression` (e.g. `getLocale()`) selects the active locale at
 *   render time, falling back to `baseLocale`.
 */
export type RuntimeConfig =
	| { readonly i18n: false }
	| {
			readonly i18n: true;
			readonly baseLocale: string;
			readonly importStatement: string;
			readonly expression: string;
	  };

const VIRTUAL_IMPORT = `import { marteContent as __marteContent } from 'virtual:marte';`;

/**
 * Walk the parsed marte block tree against the .svelte AST scope nodes, resolve
 * each leaf block's selector to its target element and return a flat list of
 * `{ node, key, inline }` triples. Keys mirror `walkLeaves` so the load and
 * transform paths agree byte-for-byte.
 */
export function resolveTargets(
	blocks: readonly MarkdownBlock[],
	scopeNodes: readonly SvelteNode[],
	file: string,
	prefix: string
): ResolvedTarget[] {
	const out: ResolvedTarget[] = [];
	const counts = new Map<string, number>();
	const firstLineFor = new Map<string, number>();
	for (const b of blocks) {
		if (!b.selector) continue;
		counts.set(b.selector, (counts.get(b.selector) ?? 0) + 1);
		if (!firstLineFor.has(b.selector)) firstLineFor.set(b.selector, b.line);
	}

	const matchesPerSelector = new Map<string, SvelteNode[]>();
	for (const [selector, expected] of counts) {
		const parsed = parseSelector(selector, file, firstLineFor.get(selector) ?? 0);
		const matches = findMatches([...scopeNodes], parsed);
		if (matches.length !== expected) {
			throw errAt(
				file,
				firstLineFor.get(selector) ?? 0,
				`selector \`${selector}\` matches ${matches.length} element(s) but the markdown has ${expected} block(s)` +
					` — give the element(s) a data-marte="name" (then address \`:::@name\`) or an id to disambiguate`
			);
		}
		matchesPerSelector.set(selector, matches);
	}

	const seen = new Map<string, number>();
	for (const b of blocks) {
		if (!b.selector) continue;
		const total = counts.get(b.selector) ?? 1;
		const i = seen.get(b.selector) ?? 0;
		seen.set(b.selector, i + 1);
		const node = matchesPerSelector.get(b.selector)![i];
		const indexed = total > 1 ? `${b.selector}[${i}]` : b.selector;
		const key = prefix ? `${prefix}/${indexed}` : indexed;
		if (b.children.length) {
			out.push(...resolveTargets(b.children, childNodes(node), file, key));
		} else {
			out.push({ node, key, inline: b.inline });
		}
	}
	return out;
}

/**
 * Rewrite a .svelte source so every element targeted by the companion markdown
 * reads its inner content from the virtual map at render time. The hardcoded
 * design-preview text in the source is replaced. Injects the runtime imports
 * and a `__marte` const at the top of the script.
 */
export function transformSvelteSource(
	svelteSource: string,
	mdSource: string,
	mdPath: string,
	runtime: RuntimeConfig
): string {
	const blocks = parseMarkdownBlocks(mdSource, mdPath);
	const nodes = parseSvelte(svelteSource);
	const targets = resolveTargets(blocks, nodes, mdPath, '');
	if (!targets.length) return svelteSource;

	const edits: Edit[] = targets.map((t) => buildReplacementEdit(t, svelteSource));
	const replaced = applyEdits(svelteSource, edits);
	return injectMarteRuntime(replaced, runtime);
}

function buildReplacementEdit(target: ResolvedTarget, source: string): Edit {
	const [start, end] = innerRange(target.node, source);
	const elementStart = target.node.start ?? start;
	const indent = leadingIndent(source, elementStart);
	const expr = `{@html __marte[${JSON.stringify(target.key)}].html}`;
	const replacement = `\n${indent}  ${expr}\n${indent}`;
	return { start, end, replacement };
}

function injectMarteRuntime(source: string, runtime: RuntimeConfig): string {
	const lines = runtime.i18n
		? [
				runtime.importStatement,
				VIRTUAL_IMPORT,
				`const __marte = __marteContent[${runtime.expression}] ?? __marteContent[${JSON.stringify(
					runtime.baseLocale
				)}];`
			]
		: [VIRTUAL_IMPORT, `const __marte = __marteContent;`];
	const block = `\n\t${lines.join('\n\t')}\n`;
	const scriptOpen = source.match(/<script(?:\s[^>]*)?>/);
	if (!scriptOpen || scriptOpen.index == null) {
		// No script block — synthesize one at the top.
		return `<script lang="ts">${block}</script>\n\n${source}`;
	}
	const insertAt = scriptOpen.index + scriptOpen[0].length;
	return source.slice(0, insertAt) + block + source.slice(insertAt);
}
