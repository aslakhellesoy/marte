import { describe, expect, test } from 'vitest';
import { applyEdits, resolveBlocks } from './apply.ts';
import { parseMarkdownBlocks } from './markdown.ts';
import { parseSvelte } from './svelte-ast.ts';

function apply(svelteSrc: string, mdSrc: string): string {
	const blocks = parseMarkdownBlocks(mdSrc, 'f.md');
	const nodes = parseSvelte(svelteSrc);
	const edits = resolveBlocks(blocks, nodes, svelteSrc, 'f.md', null);
	return applyEdits(svelteSrc, edits);
}

describe('resolveBlocks + applyEdits', () => {
	test('replaces the inner content of a single element', () => {
		const svelte = '<section>\n  <h1>Old</h1>\n</section>\n';
		const md = ':::h1 inline\nNew\n:::\n';
		expect(apply(svelte, md)).toContain('<h1>\n    New\n  </h1>');
	});

	test('matches by data-marte anchor', () => {
		const svelte = '<section>\n  <p data-marte="lead">Old</p>\n  <p>Other</p>\n</section>\n';
		const md = ':::@lead inline\nLead copy\n:::\n';
		const out = apply(svelte, md);
		expect(out).toContain('Lead copy');
		expect(out).toContain('Other');
	});

	test('throws when N markdown blocks do not equal N matching elements', () => {
		const svelte = '<div>\n  <p>One</p>\n  <p>Two</p>\n</div>\n';
		const md = ':::p inline\nOnly one\n:::\n';
		expect(() => apply(svelte, md)).toThrow(/matches 2 element\(s\) but the markdown has 1/);
	});

	test('refuses to mix prose and children in the same block', () => {
		const mdMixed = `:::section
stray
:::h1
hi
:::
:::
`;
		expect(() => parseMarkdownBlocks(mdMixed, 'f.md')).toThrow();
	});
});
