import { describe, expect, test } from 'vitest';
import { collectMarkers, parseSvelte } from './svelte-ast.ts';

const markersOf = (src: string) => collectMarkers(parseSvelte(src)).map((n) => n.name);

describe('collectMarkers', () => {
	test('finds elements with data-marte, in document order', () => {
		expect(markersOf('<h1 data-marte>a</h1>\n<p data-marte>b</p>\n')).toEqual(['h1', 'p']);
	});

	test('descends into unmarked elements to find nested markers', () => {
		expect(markersOf('<section>\n<p data-marte>a</p>\n</section>\n')).toEqual(['p']);
	});

	test('does not descend into a marked element', () => {
		expect(markersOf('<section data-marte>\n<p data-marte>a</p>\n</section>\n')).toEqual([
			'section'
		]);
	});

	test('a <!-- marte --> comment marks the following element', () => {
		expect(markersOf('<!-- marte -->\n<h2>a</h2>\n')).toEqual(['h2']);
	});

	test('the comment form marks Svelte components (where an attr would not type-check)', () => {
		expect(markersOf('<!-- marte -->\n<Card>a</Card>\n')).toEqual(['Card']);
	});

	test('ignores non-marker comments', () => {
		expect(markersOf('<!-- hello -->\n<h2>a</h2>\n')).toEqual([]);
	});
});
