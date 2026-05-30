import { errAt } from './errors.ts';
import { parseBlocks, type Block } from './markdown.ts';
import { renderInner } from './render.ts';
import {
	childNodes,
	collectMarkers,
	innerRange,
	leadingIndent,
	parseSvelte
} from './svelte-ast.ts';

/**
 * How a transformed component reads its content.
 *
 * - `{ i18n: false }` — single locale: the styled Markdown is baked directly
 *   into the component markup (so Svelte's scoped CSS applies to it).
 * - `{ i18n: true, … }` — multi-locale: every locale is baked behind an
 *   `{#if <expression> === '<locale>'}` branch; `importStatement` brings the
 *   locale accessor into scope.
 */
export type RuntimeConfig =
	| { readonly i18n: false }
	| {
			readonly i18n: true;
			readonly baseLocale: string;
			readonly importStatement: string;
			readonly expression: string;
	  };

type Edit = { readonly start: number; readonly end: number; readonly replacement: string };

/** The locales to bake, base first. Single-locale uses the one sentinel key ''. */
function localeOrder(runtime: RuntimeConfig, mdByLocale: Record<string, string>): string[] {
	if (!runtime.i18n) return [''];
	const others = Object.keys(mdByLocale).filter((l) => l !== runtime.baseLocale);
	return [runtime.baseLocale, ...others];
}

/**
 * Rewrite a `.svelte` source so each marker's inner content comes from its
 * companion Markdown block, re-skinned onto the placeholder markup. `mdByLocale`
 * maps each locale to its Markdown source (single-locale uses the key '').
 */
export function transformSvelteSource(
	svelteSource: string,
	mdByLocale: Record<string, string>,
	runtime: RuntimeConfig,
	file: string
): string {
	const nodes = parseSvelte(svelteSource);
	const markers = collectMarkers(nodes);
	if (markers.length === 0) return svelteSource;

	const locales = localeOrder(runtime, mdByLocale);
	const blocksByLocale: Record<string, Block[]> = {};
	for (const locale of locales) {
		const blocks = parseBlocks(mdByLocale[locale] ?? '');
		if (blocks.length !== markers.length) {
			throw errAt(
				file,
				null,
				`${labelLocale(locale)}has ${blocks.length} content block(s) but the component has ` +
					`${markers.length} marker(s) — they must match one-to-one`
			);
		}
		blocksByLocale[locale] = blocks;
	}

	const edits: Edit[] = markers.map((node, i) => {
		const templates = childNodes(node);
		const tag = String(node.name);
		const [start, end] = innerRange(node, svelteSource);
		const indent = leadingIndent(svelteSource, node.start ?? start);

		const perLocale = locales.map((locale) => ({
			locale,
			html: renderInner(
				blocksByLocale[locale][i].raw,
				templates,
				tag,
				file,
				blocksByLocale[locale][i].line
			)
		}));

		const replacement = runtime.i18n
			? i18nBranches(perLocale, runtime, indent)
			: `\n${indent}\t${perLocale[0].html}\n${indent}`;
		return { start, end, replacement };
	});

	let out = applyEdits(svelteSource, edits);
	if (runtime.i18n) out = injectScript(out, runtime.importStatement);
	return out;
}

function i18nBranches(
	perLocale: { locale: string; html: string }[],
	runtime: Extract<RuntimeConfig, { i18n: true }>,
	indent: string
): string {
	const pad = `\n${indent}\t`;
	const parts: string[] = [];
	perLocale.forEach(({ locale, html }, i) => {
		const head =
			i === 0
				? `{#if ${runtime.expression} === ${JSON.stringify(locale)}}`
				: i === perLocale.length - 1
					? `{:else}`
					: `{:else if ${runtime.expression} === ${JSON.stringify(locale)}}`;
		parts.push(`${pad}${head}${pad}\t${html}`);
	});
	parts.push(`${pad}{/if}`);
	return parts.join('') + `\n${indent}`;
}

function injectScript(source: string, importStatement: string): string {
	const block = `\n\t${importStatement}\n`;
	const scriptOpen = source.match(/<script(?:\s[^>]*)?>/);
	if (!scriptOpen || scriptOpen.index == null) {
		return `<script lang="ts">${block}</script>\n\n${source}`;
	}
	const insertAt = scriptOpen.index + scriptOpen[0].length;
	return source.slice(0, insertAt) + block + source.slice(insertAt);
}

function applyEdits(source: string, edits: readonly Edit[]): string {
	let out = source;
	for (const e of [...edits].sort((a, b) => b.start - a.start)) {
		out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
	}
	return out;
}

function labelLocale(locale: string): string {
	return locale ? `locale '${locale}' ` : 'the Markdown companion ';
}

/**
 * Validate a single-locale pairing without writing: throws on marker/block
 * count mismatch or structural mismatch, and returns the marker count.
 */
export function checkSvelteSource(svelteSource: string, mdSource: string, file: string): number {
	const markers = collectMarkers(parseSvelte(svelteSource));
	const blocks = parseBlocks(mdSource);
	if (blocks.length !== markers.length) {
		throw errAt(
			file,
			null,
			`${blocks.length} content block(s) but ${markers.length} marker(s) — they must match one-to-one`
		);
	}
	markers.forEach((node, i) => {
		renderInner(blocks[i].raw, childNodes(node), String(node.name), file, blocks[i].line);
	});
	return markers.length;
}
