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

function makeContext() {
	const watched: string[] = [];
	return { watched, addWatchFile: (p: string) => watched.push(p) };
}

function hook<T>(h: unknown): T {
	return (typeof h === 'function' ? h : (h as { handler: unknown }).handler) as T;
}

async function runTransform(plugin: Plugin, root: string, sveltePath: string, code: string) {
	const ctx = makeContext();
	await hook<(c: { root: string }) => Promise<void>>(plugin.configResolved).call(ctx, { root });
	const transform = hook<
		(this: typeof ctx, code: string, id: string) => Promise<{ code: string } | null>
	>(plugin.transform);
	const result = await transform.call(ctx, code, sveltePath);
	return { result, watched: ctx.watched };
}

describe('marte vite plugin — single locale', () => {
	test('bakes the sibling .md content into the component', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			const code = '<h1 data-marte>Placeholder</h1>\n';
			writeFileSync(sveltePath, code);
			writeFileSync(join(dir, 'Demo.md'), 'Hello world\n');

			const { result, watched } = await runTransform(marte(), dir, sveltePath, code);
			expect(result?.code).toContain('Hello world');
			expect(result?.code).not.toContain('Placeholder');
			expect(watched).toContain(join(dir, 'Demo.md'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('leaves a .svelte without a companion untouched', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			const code = '<h1 data-marte>x</h1>\n';
			writeFileSync(sveltePath, code);
			const { result } = await runTransform(marte(), dir, sveltePath, code);
			expect(result).toBeNull();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('marte vite plugin — i18n', () => {
	test('bakes a branch per locale from .<locale>.md companions', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			const code = '<h1 data-marte>x</h1>\n';
			writeFileSync(sveltePath, code);
			writeFileSync(join(dir, 'Demo.en.md'), 'Hello\n');
			writeFileSync(join(dir, 'Demo.no.md'), 'Hei\n');

			const plugin = marte({ locales: ['en', 'no'], baseLocale: 'en', runtimeLocale: RUNTIME });
			const { result } = await runTransform(plugin, dir, sveltePath, code);
			expect(result?.code).toContain('{#if getLocale() === "en"}');
			expect(result?.code).toContain('Hello');
			expect(result?.code).toContain('Hei');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('throws when a locale companion is missing while others exist', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'marte-'));
		try {
			const sveltePath = join(dir, 'Demo.svelte');
			const code = '<h1 data-marte>x</h1>\n';
			writeFileSync(sveltePath, code);
			writeFileSync(join(dir, 'Demo.en.md'), 'Hello\n');
			const plugin = marte({ locales: ['en', 'no'], baseLocale: 'en', runtimeLocale: RUNTIME });
			await expect(runTransform(plugin, dir, sveltePath, code)).rejects.toThrow(
				/missing translations for \[no\]/
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
