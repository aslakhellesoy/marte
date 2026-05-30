import { describe, expect, test } from 'vitest';
import { resolveTargets, transformSvelteSource, type RuntimeConfig } from './transform.ts';
import { parseMarkdownBlocks } from './markdown.ts';
import { parseSvelte } from './svelte-ast.ts';

const I18N: RuntimeConfig = {
	i18n: true,
	baseLocale: 'no',
	importStatement: "import { getLocale } from '$lib/paraglide/runtime';",
	expression: 'getLocale()'
};

describe('resolveTargets', () => {
	test('keys leaves by selector path with index suffix on repetition', () => {
		const svelte = `<section>
  <h1>title</h1>
  <p>first</p>
  <p>second</p>
</section>
`;
		const md = `:::section
:::h1 inline
A
:::
:::p inline
B
:::
:::p inline
C
:::
:::
`;
		const blocks = parseMarkdownBlocks(md, 'f.md');
		const nodes = parseSvelte(svelte);
		const targets = resolveTargets(blocks, nodes, 'f.md', '');
		expect(targets.map((t) => t.key)).toEqual(['section/h1', 'section/p[0]', 'section/p[1]']);
	});

	test('walks into Svelte component children', () => {
		const svelte = `<Card data-marte="alpha">
  <h3>A</h3>
</Card>
<Card data-marte="beta">
  <h3>B</h3>
</Card>
`;
		const md = `:::@alpha
:::h3 inline
A
:::
:::
:::@beta
:::h3 inline
B
:::
:::
`;
		const blocks = parseMarkdownBlocks(md, 'f.md');
		const nodes = parseSvelte(svelte);
		const targets = resolveTargets(blocks, nodes, 'f.md', '');
		expect(targets.map((t) => t.key)).toEqual(['@alpha/h3', '@beta/h3']);
	});

	test('throws when the .svelte does not match the block count', () => {
		const svelte = '<section><h1>A</h1></section>\n';
		const md = `:::section
:::h1 inline
A
:::
:::h1 inline
B
:::
:::
`;
		const blocks = parseMarkdownBlocks(md, 'f.md');
		const nodes = parseSvelte(svelte);
		expect(() => resolveTargets(blocks, nodes, 'f.md', '')).toThrow(/matches 1 element/);
	});
});

describe('transformSvelteSource (i18n)', () => {
	test('injects the locale import + __marte const + {@html} expressions', () => {
		const svelte = `<script lang="ts">\n\tlet x = 1;\n</script>\n\n<h1>Norwegian heading</h1>\n`;
		const md = `:::h1 inline\nFasit\n:::\n`;
		const out = transformSvelteSource(svelte, md, 'f.md', I18N);
		expect(out).toContain("import { marteContent as __marteContent } from 'virtual:marte';");
		expect(out).toContain("from '$lib/paraglide/runtime'");
		expect(out).toContain('const __marte = __marteContent[getLocale()] ?? __marteContent["no"]');
		expect(out).toContain('{@html __marte["h1"].html}');
		expect(out).not.toContain('Norwegian heading');
	});

	test('keys nested containers correctly', () => {
		const svelte = `<script>let _x = 0;</script>
<section data-marte="hero">
  <h1>Hero</h1>
  <p>Sub</p>
</section>
`;
		const md = `:::@hero
:::h1 inline
H
:::
:::p inline
P
:::
:::
`;
		const out = transformSvelteSource(svelte, md, 'f.md', I18N);
		expect(out).toContain('{@html __marte["@hero/h1"].html}');
		expect(out).toContain('{@html __marte["@hero/p"].html}');
	});

	test('synthesizes a <script> block when none exists', () => {
		const svelte = '<h1>Hi</h1>\n';
		const md = ':::h1 inline\nHei\n:::\n';
		const out = transformSvelteSource(svelte, md, 'f.md', I18N);
		expect(out.startsWith('<script lang="ts">')).toBe(true);
		expect(out).toContain('{@html __marte["h1"].html}');
	});

	test('no-ops when the .md has no targetable leaves', () => {
		const svelte = '<script>let _x = 1;</script>\n<h1>Hi</h1>\n';
		const md = '';
		const out = transformSvelteSource(svelte, md, 'f.md', I18N);
		expect(out).toBe(svelte);
	});
});

describe('transformSvelteSource (single-locale)', () => {
	test('reads the map directly and injects no locale import', () => {
		const svelte = '<h1>Placeholder</h1>\n';
		const md = ':::h1 inline\nHello\n:::\n';
		const out = transformSvelteSource(svelte, md, 'f.md', { i18n: false });
		expect(out).toContain("import { marteContent as __marteContent } from 'virtual:marte';");
		expect(out).toContain('const __marte = __marteContent;');
		expect(out).not.toContain('paraglide');
		expect(out).not.toContain('getLocale');
		expect(out).toContain('{@html __marte["h1"].html}');
	});
});
