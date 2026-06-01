import { describe, expect, test } from 'vitest';
import { collectMarkers, parseSvelte } from './svelte-ast.ts';

const markersOf = (src: string) => collectMarkers(parseSvelte(src)).map((m) => m.node.name);

describe('collectMarkers', () => {
	test('finds elements with data-malte, in document order', () => {
		expect(markersOf('<h1 data-malte>a</h1>\n<p data-malte>b</p>\n')).toEqual(['h1', 'p']);
	});

	test('descends into unmarked elements to find nested markers', () => {
		expect(markersOf('<section>\n<p data-malte>a</p>\n</section>\n')).toEqual(['p']);
	});

	test('does not descend into a marked element', () => {
		expect(markersOf('<section data-malte>\n<p data-malte>a</p>\n</section>\n')).toEqual([
			'section'
		]);
	});

	test('a <!-- malte --> comment marks the following element', () => {
		expect(markersOf('<!-- malte -->\n<h2>a</h2>\n')).toEqual(['h2']);
	});

	test('the comment form marks Svelte components', () => {
		expect(markersOf('<!-- malte -->\n<Card>a</Card>\n')).toEqual(['Card']);
	});

	test('ignores non-marker comments', () => {
		expect(markersOf('<!-- hello -->\n<h2>a</h2>\n')).toEqual([]);
	});

	test('data-malte-each yields an each marker whose template is the child element', () => {
		const markers = collectMarkers(parseSvelte('<div data-malte-each>\n<Card>x</Card>\n</div>\n'));
		expect(markers).toHaveLength(1);
		expect(markers[0].kind).toBe('each');
		expect(markers[0].node.name).toBe('div');
		expect(markers[0].kind === 'each' && markers[0].template.name).toBe('Card');
	});

	test('throws when a data-malte-each container has no child element', () => {
		expect(() => collectMarkers(parseSvelte('<div data-malte-each>text</div>\n'))).toThrow(
			/exactly one child element/
		);
	});
});
