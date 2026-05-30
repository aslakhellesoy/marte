import { describe, expect, test } from 'vitest';
import { extractFromSource, generateMd } from './extract.ts';

describe('generateMd — bootstrap (no markers yet)', () => {
	test('marks the outermost static element and serializes its content', () => {
		const svelte = '<section>\n\t<h1>Hello</h1>\n\t<p>World</p>\n</section>\n';
		const { md, svelte: out, markersAdded } = generateMd(svelte, []);
		expect(out).toContain('<section data-marte>');
		expect(md).toContain('# Hello');
		expect(md).toContain('World');
		expect(markersAdded).toBe(1);
	});

	test('separates multiple markers with ---', () => {
		// Two top-level elements with no wrapper are marked as separate leaf
		// markers, serialized inline and joined by a --- separator.
		const svelte = '<h1>One</h1>\n<p>Two</p>\n';
		const { md } = generateMd(svelte, []);
		expect(md).toContain('One');
		expect(md).toContain('\n---\n');
		expect(md).toContain('Two');
	});
});

describe('generateMd — existing markers', () => {
	test('serializes each marked element in order, leaving the source unchanged', () => {
		const svelte = '<h1 data-marte>A</h1>\n<p data-marte>B</p>\n';
		const { md, markersAdded } = generateMd(svelte, []);
		// Marked leaf elements serialize their inner text positionally.
		expect(md.trim()).toBe('A\n\n---\n\nB');
		expect(markersAdded).toBe(0);
	});
});

describe('extractFromSource', () => {
	test('round-trips: the generated markdown verifies against the marked source', () => {
		const svelte = '<section>\n\t<h1>Hello</h1>\n\t<p>A paragraph</p>\n</section>\n';
		const result = extractFromSource('f.svelte', svelte, 'f.md', { dry: true });
		expect(result.verified).toBe(true);
		expect(result.verifyMsg).toBe('');
	});
});
