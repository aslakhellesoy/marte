import { describe, expect, test } from 'vitest';
import { parseMarkdownBlocks } from './markdown.ts';
import { SyncError } from './errors.ts';

describe('parseMarkdownBlocks', () => {
	test('parses a single leaf block', () => {
		const md = ':::h1\nHello\n:::\n';
		const blocks = parseMarkdownBlocks(md, 'f.md');
		expect(blocks).toHaveLength(1);
		expect(blocks[0].selector).toBe('h1');
		expect(blocks[0].ownLines.join('\n')).toBe('Hello');
		expect(blocks[0].children).toHaveLength(0);
	});

	test('parses the inline flag', () => {
		const md = ':::span.label inline\nHi\n:::\n';
		const [block] = parseMarkdownBlocks(md, 'f.md');
		expect(block.inline).toBe(true);
		expect(block.selector).toBe('span.label');
	});

	test('nests containers and leaves', () => {
		const md = `:::section.hero
:::h1
Heading
:::
:::p
Body
:::
:::
`;
		const blocks = parseMarkdownBlocks(md, 'f.md');
		expect(blocks).toHaveLength(1);
		expect(blocks[0].selector).toBe('section.hero');
		expect(blocks[0].children).toHaveLength(2);
		expect(blocks[0].children[0].selector).toBe('h1');
		expect(blocks[0].children[1].selector).toBe('p');
	});

	test('throws on stray closing fence', () => {
		expect(() => parseMarkdownBlocks(':::\n', 'f.md')).toThrow(SyncError);
	});

	test('throws on unclosed block', () => {
		expect(() => parseMarkdownBlocks(':::h1\nText\n', 'f.md')).toThrow(/never closed/);
	});

	test('throws when a block mixes prose and children', () => {
		const md = `:::div
hello
:::p
inner
:::
:::
`;
		expect(() => parseMarkdownBlocks(md, 'f.md')).toThrow(/mixes prose and child blocks/);
	});

	test('throws on content outside any block', () => {
		expect(() => parseMarkdownBlocks('orphan\n:::h1\nhi\n:::\n', 'f.md')).toThrow(
			/content outside of any/
		);
	});
});
