import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { transformSvelteSource, type RuntimeConfig } from './transform.ts';

/**
 * Describes how a transformed component reads the active locale at runtime. The
 * `importStatement` is injected verbatim into the component's `<script>`, and
 * `expression` (e.g. `getLocale()`) is evaluated to choose the locale branch.
 */
export type RuntimeLocale = {
	readonly importStatement: string;
	readonly expression: string;
};

export type MarteOptions = {
	/**
	 * Locales to manage. Omitted (or a single entry) selects single-locale mode:
	 * each `Foo.svelte` pairs with a sibling `Foo.md`. Two or more locales select
	 * i18n mode: each `Foo.svelte` pairs with `Foo.<locale>.md` companions.
	 */
	readonly locales?: readonly string[];
	/** The base/source locale (i18n mode). Defaults to the first of `locales`. */
	readonly baseLocale?: string;
	/**
	 * Path to a Paraglide/inlang project (`project.inlang`) whose `settings.json`
	 * supplies the locale list. Enables i18n mode and a default Paraglide runtime
	 * accessor. Resolved against the Vite root.
	 */
	readonly paraglideProject?: string;
	/**
	 * Runtime locale accessor injected for i18n mode. Required for i18n unless
	 * `paraglideProject` is used (which defaults it to Paraglide's runtime).
	 */
	readonly runtimeLocale?: RuntimeLocale;
};

type ResolvedOptions =
	| { readonly i18n: false }
	| {
			readonly i18n: true;
			readonly locales: readonly string[];
			readonly baseLocale: string;
			readonly runtimeLocale: RuntimeLocale;
	  };

const PARAGLIDE_RUNTIME: RuntimeLocale = {
	importStatement: `import { getLocale as __marteGetLocale } from '$lib/paraglide/runtime';`,
	expression: '__marteGetLocale()'
};

export function marte(options: MarteOptions = {}): Plugin {
	let resolved: ResolvedOptions | null = null;
	let viteRoot = process.cwd();

	return {
		name: 'marte',
		enforce: 'pre',

		async configResolved(config) {
			viteRoot = config.root;
			resolved = await resolveOptions(options, viteRoot);
		},

		async transform(code, id) {
			if (!resolved) return null;
			// Skip vite-plugin-svelte's query sub-modules (e.g. `?svelte&type=style`).
			if (id.includes('?')) return null;
			if (!id.endsWith('.svelte')) return null;

			const mdByLocale = await readCompanions(id, resolved, (p) => this.addWatchFile(p));
			if (!mdByLocale) return null;

			const runtime: RuntimeConfig = resolved.i18n
				? {
						i18n: true,
						baseLocale: resolved.baseLocale,
						importStatement: resolved.runtimeLocale.importStatement,
						expression: resolved.runtimeLocale.expression
					}
				: { i18n: false };
			const transformed = transformSvelteSource(code, mdByLocale, runtime, id);
			if (transformed === code) return null;
			return { code: transformed, map: null };
		},

		handleHotUpdate(ctx) {
			if (!resolved) return;
			const sveltePath = resolved.i18n
				? matchLocaleMd(ctx.file, resolved.locales)
				: matchSingleMd(ctx.file);
			if (!sveltePath) return;
			const mods = ctx.server.moduleGraph.getModulesByFile(sveltePath) ?? new Set();
			for (const m of mods) ctx.server.moduleGraph.invalidateModule(m);
			ctx.server.ws.send({ type: 'full-reload' });
			return [];
		}
	};
}

/**
 * Read the Markdown companion(s) for a `.svelte` file. Only existing companions
 * are registered with `addWatchFile` — Vite ≥8's `TransformPluginContext`
 * treats every watched path as an `_addedImport` and runs it through import
 * resolution, which fails on absent files (e.g. `.svelte-kit/generated/root.en.md`
 * for SvelteKit's generated root). The dev server's chokidar watcher already
 * covers the project tree, so newly created companions still fire
 * `handleHotUpdate` and trigger a reload. Returns null when the file is not
 * marte-managed (no base companion).
 */
async function readCompanions(
	sveltePath: string,
	resolved: ResolvedOptions,
	watch: (path: string) => void
): Promise<Record<string, string> | null> {
	const dir = dirname(sveltePath);
	const base = basename(sveltePath, '.svelte');

	if (!resolved.i18n) {
		const mdPath = join(dir, `${base}.md`);
		if (!(await fileExists(mdPath))) return null;
		watch(mdPath);
		return { '': await readFile(mdPath, 'utf8') };
	}

	const out: Record<string, string> = {};
	const present: string[] = [];
	const missing: string[] = [];
	for (const locale of resolved.locales) {
		const mdPath = join(dir, `${base}.${locale}.md`);
		if (await fileExists(mdPath)) {
			watch(mdPath);
			out[locale] = await readFile(mdPath, 'utf8');
			present.push(locale);
		} else {
			missing.push(locale);
		}
	}
	if (present.length === 0) return null;
	if (missing.length > 0) {
		throw new Error(
			`marte: ${sveltePath} has companions for [${present.join(', ')}] but is missing ` +
				`translations for [${missing.join(', ')}]. Create ${missing
					.map((l) => `${base}.${l}.md`)
					.join(', ')} (or remove the existing companions if this page is not marte-managed).`
		);
	}
	return out;
}

function matchSingleMd(file: string): string | null {
	if (!file.endsWith('.md')) return null;
	return file.slice(0, -'.md'.length) + '.svelte';
}

function matchLocaleMd(file: string, locales: readonly string[]): string | null {
	for (const locale of locales) {
		const suffix = `.${locale}.md`;
		if (file.endsWith(suffix)) return file.slice(0, -suffix.length) + '.svelte';
	}
	return null;
}

async function resolveOptions(opts: MarteOptions, viteRoot: string): Promise<ResolvedOptions> {
	if (opts.locales && opts.locales.length > 1) {
		return makeI18n(opts, opts.locales, opts.baseLocale ?? opts.locales[0], false);
	}
	if (opts.paraglideProject) {
		const projectPath = resolvePath(opts.paraglideProject, viteRoot);
		const settings = await readParaglideSettings(projectPath);
		return makeI18n(
			opts,
			opts.locales ?? settings.locales,
			opts.baseLocale ?? settings.baseLocale,
			true
		);
	}
	return { i18n: false };
}

function makeI18n(
	opts: MarteOptions,
	locales: readonly string[],
	baseLocale: string,
	paraglide: boolean
): ResolvedOptions {
	const runtimeLocale = opts.runtimeLocale ?? (paraglide ? PARAGLIDE_RUNTIME : undefined);
	if (!runtimeLocale) {
		throw new Error(
			`marte: i18n mode (locales [${locales.join(', ')}]) requires a \`runtimeLocale\` option ` +
				`describing how to read the active locale at runtime, e.g. ` +
				`{ importStatement: "import { getLocale } from '$lib/i18n'", expression: 'getLocale()' }.`
		);
	}
	return { i18n: true, locales, baseLocale, runtimeLocale };
}

type ParaglideSettings = { baseLocale: string; locales: string[] };

async function readParaglideSettings(projectPath: string): Promise<ParaglideSettings> {
	const settingsPath = join(projectPath, 'settings.json');
	const raw = await readFile(settingsPath, 'utf8');
	const parsed = JSON.parse(raw) as Partial<ParaglideSettings>;
	if (!parsed.baseLocale || !Array.isArray(parsed.locales)) {
		throw new Error(
			`marte plugin: ${settingsPath} is missing baseLocale or locales — cannot determine target locales.`
		);
	}
	return { baseLocale: parsed.baseLocale, locales: parsed.locales };
}

function resolvePath(p: string, root: string): string {
	if (p.startsWith('file://')) return fileURLToPath(p);
	return isAbsolute(p) ? p : resolve(root, p);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
