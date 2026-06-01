import { describe, expect, test } from 'vitest';
import { renderInner } from './render.ts';
import { childNodes, collectMarkers, parseSvelte } from './svelte-ast.ts';

// Resolve the first marked element's templates + tag from a .svelte snippet.
function target(src: string) {
	const { node } = collectMarkers(parseSvelte(src))[0];
	return { templates: childNodes(node), tag: String(node.name) };
}

describe('renderInner — leaf elements', () => {
	test('inline-renders Markdown with no <p> wrapper', () => {
		const { templates, tag } = target('<h1 data-malte>x</h1>');
		expect(renderInner('Build **fast** sites', templates, tag, 'f.md', 1)).toBe(
			'Build <strong>fast</strong> sites'
		);
	});

	test('escapes braces so Svelte does not treat them as expressions', () => {
		const { templates, tag } = target('<p data-malte>x</p>');
		expect(renderInner('Use {state}', templates, tag, 'f.md', 1)).toBe('Use &lbrace;state&rbrace;');
	});
});

describe('renderInner — Svelte component placeholders', () => {
	// The placeholder is a component, so malte doesn't know what HTML it will
	// emit. Full block-level Markdown must work (the component owns the
	// surrounding markup), with a single `<p>` unwrapped so plain inline
	// blocks still slot in without an extra paragraph.
	test('renders block-level Markdown inside a component (e.g. ## heading)', () => {
		const { templates, tag } = target('<!-- malte -->\n<FactBox>placeholder</FactBox>');
		const html = renderInner('## A title\n\nA body', templates, tag, 'f.md', 1);
		expect(html).toContain('<h2>A title</h2>');
		expect(html).toContain('<p>A body</p>');
	});

	test('unwraps a single rendered <p> so inline-only blocks stay inline', () => {
		const { templates, tag } = target('<!-- malte -->\n<FactBox>placeholder</FactBox>');
		expect(renderInner('**Bold** text', templates, tag, 'f.md', 1)).toBe(
			'<strong>Bold</strong> text'
		);
	});
});

describe('renderInner — container style transfer', () => {
	test('re-skins a bullet list onto <li> templates, cycling for repeats', () => {
		const { templates, tag } = target(
			'<ul data-malte class="feats">\n\t<li class="odd">A</li>\n\t<li class="even">B</li>\n</ul>'
		);
		const html = renderInner('- one\n- two\n- three\n- four', templates, tag, 'f.md', 1);
		expect(html).toContain('<li class="odd">one</li>');
		expect(html).toContain('<li class="even">two</li>');
		expect(html).toContain('<li class="odd">three</li>');
		expect(html).toContain('<li class="even">four</li>');
	});

	test('maps a heading + paragraph onto a card placeholder, copying classes recursively', () => {
		const { templates, tag } = target(
			'<div data-malte class="card">\n\t<h3 class="t">T</h3>\n\t<p class="b">B</p>\n</div>'
		);
		const html = renderInner('### New title\n\nNew body', templates, tag, 'f.md', 1);
		expect(html).toContain('<h3 class="t">New title</h3>');
		expect(html).toContain('<p class="b">New body</p>');
	});

	test('passes inline formatting (em, links) through without needing a template', () => {
		const { templates, tag } = target('<ul data-malte>\n\t<li class="i">A</li>\n</ul>');
		const html = renderInner('- plain *bold* and [link](https://x)', templates, tag, 'f.md', 1);
		expect(html).toContain('<li class="i">');
		expect(html).toContain('<em>bold</em>');
		expect(html).toContain('<a href="https://x">link</a>');
	});

	test('fails loudly when the rendered structure does not match the placeholder', () => {
		const { templates, tag } = target('<ul data-malte>\n\t<li>A</li>\n</ul>');
		expect(() => renderInner('Just a paragraph.', templates, tag, 'f.md', 1)).toThrow(
			/no matching placeholder element/
		);
	});
});
