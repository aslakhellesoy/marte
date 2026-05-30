import { describe, expect, test } from 'vitest';
import { parseBlocks } from './markdown.ts';

describe('parseBlocks', () => {
	test('a file with no separator is one block', () => {
		const blocks = parseBlocks('# Hello\n\nWorld\n');
		expect(blocks).toHaveLength(1);
		expect(blocks[0].raw).toBe('# Hello\n\nWorld');
	});

	test('splits on --- thematic breaks', () => {
		const blocks = parseBlocks('A\n\n---\n\nB\n\n---\n\nC\n');
		expect(blocks.map((b) => b.raw)).toEqual(['A', 'B', 'C']);
	});

	test('drops empty leading/trailing edge blocks', () => {
		const blocks = parseBlocks('---\nA\n---\n');
		expect(blocks.map((b) => b.raw)).toEqual(['A']);
	});

	test('keeps an intentionally empty block between separators', () => {
		const blocks = parseBlocks('A\n---\n---\nB\n');
		expect(blocks.map((b) => b.raw)).toEqual(['A', '', 'B']);
	});

	test('reports the starting line of each block', () => {
		const blocks = parseBlocks('A\n---\nB\n');
		expect(blocks[0].line).toBe(1);
		expect(blocks[1].line).toBe(3);
	});
});
