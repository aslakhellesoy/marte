import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { marte, type RuntimeLocale } from './vite.ts';

type Plugin = ReturnType<typeof marte>;

const RUNTIME: RuntimeLocale = {
	importStatement: "import { getLocale } from '$lib/i18n';",
	expression: 'getLocale()'
};

type MockContext = {
	error: (msg: string) => never;
	addWatchFile: (path: string) => void;
};

function makeContext(): MockContext & { watched: string[] } {
	const watched: string[] = [];
	return {
		watched,
		error: (msg: string) => {
			throw new Error(msg);
		},
		addWatchFile: (path: string) => {
			watched.push(path);
		}
	};
}

async function runPlugin(plugin: Plugin, sveltePath: string, ctx: MockContext) {
	if (!plugin.configResolved) throw new Error('plugin missing configResolved');
	const configResolved = (
		typeof plugin.configResolved === 'function'
			? plugin.configResolved
			: plugin.configResolved.handler
	) as (config: { root: string }) => Promise<void> | void;
	await configResolved.call(ctx, { root: process.cwd() });
	const resolveId = (
		typeof plugin.resolveId === 'function' ? plugin.resolveId : plugin.resolveId?.handler
	) as (this: MockContext, source: string, importer?: string) => Promise<string | null | undefined>;
	const id = await resolveId.call(ctx, 'virtual:marte', sveltePath);
	if (!id) throw new Error('plugin did not resolve virtual:marte');
	const load = (typeof plugin.load === 'function' ? plugin.load : plugin.load?.handler) as (
		this: MockContext,
		id: string
	) => Promise<string | null | undefined>;
	const code = await load.call(ctx, id);
	if (!code) throw new Error('plugin load returned nothing');
	return code;
}

describe('marte vite plugin (i18n)', () => {
	test('emits a per-locale selector→html map for sibling .md files', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-vite-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			writeFileSync(sveltePath, '<h1>Placeholder</h1>\n');
			writeFileSync(join(dir, 'Demo.no.md'), ':::h1 inline\nHei\n:::\n');
			writeFileSync(join(dir, 'Demo.en.md'), ':::h1 inline\nHello\n:::\n');

			const plugin = marte({ locales: ['no', 'en'], baseLocale: 'no', runtimeLocale: RUNTIME });
			const ctx = makeContext();
			const code = await runPlugin(plugin, sveltePath, ctx);

			expect(code).toContain('export const marteContent');
			const json = code.match(/=\s*(\{.*\});/s)?.[1];
			expect(json).toBeTruthy();
			const map = JSON.parse(json ?? '{}');
			expect(map.no.h1.html).toContain('Hei');
			expect(map.en.h1.html).toContain('Hello');
			expect(map.no.h1.inline).toBe(true);

			expect(ctx.watched).toContain(join(dir, 'Demo.no.md'));
			expect(ctx.watched).toContain(join(dir, 'Demo.en.md'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('emits an empty map when no .md companions exist at all', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-vite-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			writeFileSync(sveltePath, '<h1>x</h1>\n');
			const plugin = marte({ locales: ['no', 'en'], baseLocale: 'no', runtimeLocale: RUNTIME });
			const ctx = makeContext();
			const code = await runPlugin(plugin, sveltePath, ctx);
			const json = code.match(/=\s*(\{.*\});/s)?.[1] ?? '{}';
			const map = JSON.parse(json);
			expect(Object.keys(map)).toHaveLength(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('rejects imports from non-.svelte files', async () => {
		const plugin = marte({ locales: ['no', 'en'], baseLocale: 'no', runtimeLocale: RUNTIME });
		const ctx = makeContext();
		await expect(runPlugin(plugin, '/some/file.ts', ctx)).rejects.toThrow(
			/must be imported from a .svelte file/
		);
	});

	test('throws when a locale companion is missing while others exist', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-vite-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			writeFileSync(sveltePath, '<h1>x</h1>\n');
			writeFileSync(join(dir, 'Demo.no.md'), ':::h1 inline\nHei\n:::\n');
			// Note: no Demo.en.md.
			const plugin = marte({ locales: ['no', 'en'], baseLocale: 'no', runtimeLocale: RUNTIME });
			const ctx = makeContext();
			await expect(runPlugin(plugin, sveltePath, ctx)).rejects.toThrow(
				/missing translations for \[en\]/
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('throws when locales disagree on selector keys', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-vite-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			writeFileSync(sveltePath, '<section>\n  <h1>x</h1>\n  <p>y</p>\n</section>\n');
			writeFileSync(join(dir, 'Demo.no.md'), ':::h1 inline\nHei\n:::\n:::p inline\nDu\n:::\n');
			writeFileSync(join(dir, 'Demo.en.md'), ':::h1 inline\nHello\n:::\n');
			const plugin = marte({ locales: ['no', 'en'], baseLocale: 'no', runtimeLocale: RUNTIME });
			const ctx = makeContext();
			await expect(runPlugin(plugin, sveltePath, ctx)).rejects.toThrow(/disagree on selectors/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('marte vite plugin (single-locale)', () => {
	test('emits the selector map directly for a sibling .md', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-vite-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			writeFileSync(sveltePath, '<h1>Placeholder</h1>\n');
			writeFileSync(join(dir, 'Demo.md'), ':::h1 inline\nHello\n:::\n');

			const plugin = marte();
			const ctx = makeContext();
			const code = await runPlugin(plugin, sveltePath, ctx);
			const json = code.match(/=\s*(\{.*\});/s)?.[1] ?? '{}';
			const map = JSON.parse(json);
			expect(map.h1.html).toContain('Hello');
			expect(map.h1.inline).toBe(true);
			expect(ctx.watched).toContain(join(dir, 'Demo.md'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
