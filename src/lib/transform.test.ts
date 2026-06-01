import { describe, expect, test } from 'vitest';
import { checkSvelteSource, transformSvelteSource, type RuntimeConfig } from './transform.ts';

const SINGLE: RuntimeConfig = { i18n: false };
const I18N: RuntimeConfig = {
	i18n: true,
	baseLocale: 'en',
	importStatement: "import { getLocale } from '$lib/i18n';",
	expression: 'getLocale()'
};

describe('transformSvelteSource — single locale', () => {
	test('bakes inline content into a leaf marker and drops the placeholder', () => {
		const out = transformSvelteSource(
			'<h1 data-malte>Placeholder</h1>\n',
			{ '': 'Hello **world**\n' },
			SINGLE,
			'f'
		);
		expect(out).toContain('<h1 data-malte>');
		expect(out).toContain('Hello <strong>world</strong>');
		expect(out).not.toContain('Placeholder');
	});

	test('re-skins a list, keeping the marked element’s own attributes', () => {
		const svelte = '<ul data-malte class="feats">\n\t<li class="i">A</li>\n</ul>\n';
		const out = transformSvelteSource(svelte, { '': '- one\n- two\n' }, SINGLE, 'f');
		expect(out).toContain('<ul data-malte class="feats">');
		expect(out).toContain('<li class="i">one</li>');
		expect(out).toContain('<li class="i">two</li>');
	});

	test('no-ops when there are no markers', () => {
		const svelte = '<h1>Untouched</h1>\n';
		expect(transformSvelteSource(svelte, { '': 'x\n' }, SINGLE, 'f')).toBe(svelte);
	});

	test('throws when block count and marker count differ', () => {
		expect(() =>
			transformSvelteSource(
				'<h1 data-malte>a</h1>\n<p data-malte>b</p>\n',
				{ '': 'only one\n' },
				SINGLE,
				'f'
			)
		).toThrow(/match one-to-one/);
	});
});

describe('transformSvelteSource — i18n', () => {
	test('bakes one {#if} branch per locale and injects the runtime import', () => {
		const out = transformSvelteSource(
			'<h1 data-malte>x</h1>\n',
			{ en: 'Hello\n', no: 'Hei\n' },
			I18N,
			'f'
		);
		expect(out).toContain("import { getLocale } from '$lib/i18n';");
		expect(out).toContain('{#if getLocale() === "en"}');
		expect(out).toContain('Hello');
		expect(out).toContain('{:else}');
		expect(out).toContain('Hei');
		expect(out).toContain('{/if}');
	});
});

describe('checkSvelteSource', () => {
	test('returns the marker count when everything resolves', () => {
		expect(checkSvelteSource('<h1 data-malte>a</h1>\n', 'Hi\n', 'f')).toBe(1);
	});

	test('throws on a structural mismatch', () => {
		expect(() => checkSvelteSource('<ul data-malte><li>a</li></ul>\n', 'paragraph\n', 'f')).toThrow(
			/no matching placeholder element/
		);
	});
});

describe('transformSvelteSource — repeatable regions (data-malte-each)', () => {
	const each = '<div data-malte-each>\n\t<Item>placeholder</Item>\n</div>\n';
	const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

	test('repeats the template once per block (remainder rule)', () => {
		const out = transformSvelteSource(each, { '': 'One\n---\nTwo\n---\nThree\n' }, SINGLE, 'f');
		expect(count(out, /<Item>/g)).toBe(3);
		expect(out).toContain('One');
		expect(out).toContain('Three');
		expect(out).not.toContain('placeholder');
	});

	test('fixed markers take one block each; the each region takes the remainder', () => {
		const out = transformSvelteSource(
			`<h1 data-malte>t</h1>\n${each}`,
			{ '': 'Title\n---\nA\n---\nB\n---\nC\n' },
			SINGLE,
			'f'
		);
		expect(out).toContain('Title');
		expect(count(out, /<Item>/g)).toBe(3);
	});

	test('i18n: each locale renders its own instance count', () => {
		const out = transformSvelteSource(
			each,
			{ en: 'A\n---\nB\n---\nC\n', no: 'X\n---\nY\n' },
			I18N,
			'f'
		);
		expect(count(out, /<Item>/g)).toBe(5); // 3 (en) + 2 (no), each behind its branch
		expect(out).toContain('{#if getLocale() === "en"}');
	});

	test('two repeatable regions in one file fail with guidance to split components', () => {
		expect(() =>
			transformSvelteSource(`${each}${each}`, { '': 'A\n---\nB\n---\nC\n' }, SINGLE, 'f')
		).toThrow(/one repeatable region/);
	});
});
