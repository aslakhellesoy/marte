import { describe, expect, test } from 'vitest';
import { buildSelectorMap } from './build-map.ts';

describe('buildSelectorMap', () => {
	test('emits a leaf entry per selector', () => {
		const md = `:::h1 inline
Hello
:::
:::@hero inline
Welcome
:::
`;
		const map = buildSelectorMap(md, 'f.md');
		expect(map['h1']).toBeDefined();
		expect(map['h1'].html).toContain('Hello');
		expect(map['h1'].inline).toBe(true);
		expect(map['@hero'].html).toContain('Welcome');
	});

	test('joins nested selectors with /', () => {
		const md = `:::section.hero
:::h1 inline
Hi
:::
:::p inline
There
:::
:::
`;
		const map = buildSelectorMap(md, 'f.md');
		expect(map['section.hero/h1']).toBeDefined();
		expect(map['section.hero/h1'].html).toContain('Hi');
		expect(map['section.hero/p'].html).toContain('There');
		expect(map['section.hero']).toBeUndefined(); // container, not a leaf
	});

	test('renders block content as full HTML (not inline)', () => {
		const md = `:::article
# Heading

A paragraph.
:::
`;
		const map = buildSelectorMap(md, 'f.md');
		expect(map['article'].inline).toBe(false);
		expect(map['article'].html).toContain('<h1>');
		expect(map['article'].html).toContain('<p>');
	});
});
