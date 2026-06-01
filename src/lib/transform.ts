import { errAt } from './errors.ts';
import { parseBlocks, type Block } from './markdown.ts';
import { renderInner } from './render.ts';
import {
	childNodes,
	collectMarkers,
	innerRange,
	leadingIndent,
	parseSvelte,
	type Marker,
	type SvelteNode
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

function localeOrder(runtime: RuntimeConfig, mdByLocale: Record<string, string>): string[] {
	if (!runtime.i18n) return [''];
	const others = Object.keys(mdByLocale).filter((l) => l !== runtime.baseLocale);
	return [runtime.baseLocale, ...others];
}

function labelLocale(locale: string): string {
	return locale ? `locale '${locale}' ` : 'the Markdown companion ';
}

/**
 * Decide which Markdown blocks fill each marker, for one locale.
 *
 * Each `single` marker takes one block; the single allowed `each` marker takes
 * the remainder. The count is computed per locale, so locales may differ (e.g.
 * 8 cards in English, 6 in Norwegian). A file may contain at most one repeatable
 * region — keeping the Markdown free of any region-divider syntax — so a second
 * `data-malte-each` is a hard error pointing at component composition instead.
 */
export function assignBlocks(
	markers: readonly Marker[],
	md: string,
	file: string,
	label: string
): Block[][] {
	const eachCount = markers.filter((m) => m.kind === 'each').length;
	const blocks = parseBlocks(md);
	const singles = markers.length - eachCount;

	if (eachCount > 1) {
		throw errAt(
			file,
			null,
			`a Markdown file supports one repeatable region (data-malte-each), but the component ` +
				`has ${eachCount}. Move the extra region(s) into their own components, each with its ` +
				`own Markdown companion.`
		);
	}

	if (eachCount === 0) {
		if (blocks.length !== markers.length) {
			throw errAt(
				file,
				null,
				`${label}has ${blocks.length} content block(s) but the component has ${markers.length} ` +
					`marker(s) — they must match one-to-one`
			);
		}
		return markers.map((_, i) => [blocks[i]]);
	}

	const remainder = blocks.length - singles;
	if (remainder < 0) {
		throw errAt(
			file,
			null,
			`${label}has ${blocks.length} block(s) but the component has ${singles} fixed marker(s)`
		);
	}

	const out: Block[][] = [];
	let bi = 0;
	for (const m of markers) {
		if (m.kind === 'each') {
			out.push(blocks.slice(bi, bi + remainder));
			bi += remainder;
		} else {
			out.push([blocks[bi]]);
			bi += 1;
		}
	}
	return out;
}

// Inner HTML a marker contributes for one locale: a single marker renders its
// one block; an each marker renders one filled copy of its template per block.
function renderMarker(
	marker: Marker,
	blocks: readonly Block[],
	source: string,
	file: string,
	indent: string
): string {
	if (marker.kind === 'single') {
		const b = blocks[0];
		return renderInner(b.raw, childNodes(marker.node), String(marker.node.name), file, b.line);
	}
	const copies = blocks.map((b) => fillTemplate(marker.template, b, source, file));
	return copies.join(`\n${indent}\t`);
}

// Reproduce the template element's opening/closing tags around freshly rendered
// inner content, so each repeated instance keeps the template's attributes.
function fillTemplate(template: SvelteNode, block: Block, source: string, file: string): string {
	const tag = String(template.name);
	const [is, ie] = innerRange(template, source);
	const open = source.slice(template.start ?? 0, is);
	const close = source.slice(ie, template.end ?? source.length);
	const indent = leadingIndent(source, template.start ?? 0);
	const inner = renderInner(block.raw, childNodes(template), tag, file, block.line);
	return `${open}\n${indent}\t${inner}\n${indent}${close}`;
}

export function transformSvelteSource(
	svelteSource: string,
	mdByLocale: Record<string, string>,
	runtime: RuntimeConfig,
	file: string
): string {
	const markers = collectMarkers(parseSvelte(svelteSource));
	if (markers.length === 0) return svelteSource;

	const locales = localeOrder(runtime, mdByLocale);
	const assignment: Record<string, Block[][]> = {};
	for (const locale of locales) {
		assignment[locale] = assignBlocks(markers, mdByLocale[locale] ?? '', file, labelLocale(locale));
	}

	const edits: Edit[] = markers.map((marker, i) => {
		const [start, end] = innerRange(marker.node, svelteSource);
		const indent = leadingIndent(svelteSource, marker.node.start ?? start);
		const perLocale = locales.map((locale) => ({
			locale,
			html: renderMarker(marker, assignment[locale][i], svelteSource, file, indent)
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

/**
 * Validate a single-locale pairing without writing: throws on count or
 * structural mismatch, and returns the marker count.
 */
export function checkSvelteSource(svelteSource: string, mdSource: string, file: string): number {
	const markers = collectMarkers(parseSvelte(svelteSource));
	const assignment = assignBlocks(markers, mdSource, file, labelLocale(''));
	markers.forEach((marker, i) => {
		const templateNode = marker.kind === 'each' ? marker.template : marker.node;
		for (const b of assignment[i]) {
			renderInner(b.raw, childNodes(templateNode), String(templateNode.name), file, b.line);
		}
	});
	return markers.length;
}
