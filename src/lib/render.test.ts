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
		const { templates, tag } = target('<h1 data-marte>x</h1>');
		expect(renderInner('Build **fast** sites', templates, tag, 'f.md', 1)).toBe(
			'Build <strong>fast</strong> sites'
		);
	});

	test('escapes braces so Svelte does not treat them as expressions', () => {
		const { templates, tag } = target('<p data-marte>x</p>');
		expect(renderInner('Use {state}', templates, tag, 'f.md', 1)).toBe('Use &lbrace;state&rbrace;');
	});
});

describe('renderInner — container style transfer', () => {
	test('re-skins a bullet list onto <li> templates, cycling for repeats', () => {
		const { templates, tag } = target(
			'<ul data-marte class="feats">\n\t<li class="odd">A</li>\n\t<li class="even">B</li>\n</ul>'
		);
		const html = renderInner('- one\n- two\n- three\n- four', templates, tag, 'f.md', 1);
		expect(html).toContain('<li class="odd">one</li>');
		expect(html).toContain('<li class="even">two</li>');
		expect(html).toContain('<li class="odd">three</li>');
		expect(html).toContain('<li class="even">four</li>');
	});

	test('maps a heading + paragraph onto a card placeholder, copying classes recursively', () => {
		const { templates, tag } = target(
			'<div data-marte class="card">\n\t<h3 class="t">T</h3>\n\t<p class="b">B</p>\n</div>'
		);
		const html = renderInner('### New title\n\nNew body', templates, tag, 'f.md', 1);
		expect(html).toContain('<h3 class="t">New title</h3>');
		expect(html).toContain('<p class="b">New body</p>');
	});

	test('passes inline formatting (em, links) through without needing a template', () => {
		const { templates, tag } = target('<ul data-marte>\n\t<li class="i">A</li>\n</ul>');
		const html = renderInner('- plain *bold* and [link](https://x)', templates, tag, 'f.md', 1);
		expect(html).toContain('<li class="i">');
		expect(html).toContain('<em>bold</em>');
		expect(html).toContain('<a href="https://x">link</a>');
	});

	test('fails loudly when the rendered structure does not match the placeholder', () => {
		const { templates, tag } = target('<ul data-marte>\n\t<li>A</li>\n</ul>');
		expect(() => renderInner('Just a paragraph.', templates, tag, 'f.md', 1)).toThrow(
			/no matching placeholder element/
		);
	});
});
