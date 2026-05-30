import { describe, expect, test } from 'vitest';
import { extractFromSource, generateMd } from './extract.ts';

describe('generateMd', () => {
	test('serializes static container content as a single block of markdown', () => {
		const svelte = '<section>\n  <h1>Hello</h1>\n  <p>World</p>\n</section>\n';
		const { md } = generateMd(svelte, 'f.md', []);
		expect(md).toContain(':::section');
		expect(md).toContain('# Hello');
		expect(md).toContain('World');
	});

	test('serializes a sibling h1 and h2 inside a non-container parent', () => {
		const svelte = '<header>\n  <h1>Title</h1>\n</header>\n<p>Body</p>\n';
		const { md } = generateMd(svelte, 'f.md', []);
		expect(md).toContain('# Title');
		expect(md).toContain(':::p inline');
		expect(md).toContain('Body');
	});

	test('walks into Svelte components for static prose', () => {
		const svelte = `<Card>
  <h3>Title</h3>
  <p>Body</p>
</Card>
`;
		const { md } = generateMd(svelte, 'f.md', []);
		expect(md).toContain('Title');
		expect(md).toContain('Body');
	});

	test('skips {#snippet} contents and flags them as dynamic', () => {
		const svelte = `<section>
  <h1>Heading</h1>
  {#snippet card(title)}<h3>{title}</h3>{/snippet}
</section>
`;
		const warnings: string[] = [];
		const { md } = generateMd(svelte, 'f.md', warnings);
		expect(md).toContain('Heading');
		expect(md).not.toContain(':::h3');
		expect(warnings.some((w) => w.includes('SnippetBlock'))).toBe(true);
	});

	test('round-trips: extract → apply → extract yields the same markdown', () => {
		const svelte = `<section>
  <h1>Hello</h1>
  <p data-marte="lead">A paragraph</p>
  <Card>
    <h3>Card title</h3>
    <p>Card body</p>
  </Card>
</section>
`;
		const result = extractFromSource('f.svelte', svelte, 'f.md', { dry: true });
		expect(result.verified).toBe(true);
		expect(result.verifyMsg).toBe('');
	});
});
