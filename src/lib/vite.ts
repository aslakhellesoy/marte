import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { buildSelectorMap, type SelectorMap } from './build-map.ts';
import { transformSvelteSource, type RuntimeConfig } from './transform.ts';

/**
 * Describes how a transformed component reads the active locale at runtime. The
 * `importStatement` is injected verbatim into the component's `<script>`, and
 * `expression` (e.g. `getLocale()`) is evaluated to pick the locale key.
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
	/**
	 * The base/source locale (i18n mode). Defaults to the first entry of
	 * `locales`, or — when `paraglideProject` is set — the project's baseLocale.
	 */
	readonly baseLocale?: string;
	/**
	 * Path to a Paraglide/inlang project (`project.inlang`) whose
	 * `settings.json` supplies the locale list. Setting this enables i18n mode
	 * and, unless overridden, a Paraglide `getLocale` runtime accessor.
	 * Resolved against the Vite root.
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

const VIRTUAL_ID = 'virtual:marte';
const RESOLVED_PREFIX = '\0virtual:marte:';
// Suffix kept so the resolved id does NOT end in `.svelte`, otherwise
// vite-plugin-svelte tries to compile our JSON output as Svelte source.
const RESOLVED_SUFFIX = '.marte.js';

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
			// vite-plugin-svelte synthesises sub-modules from a .svelte file with
			// query strings like `?svelte&type=style&lang.css`. Skip those — the
			// source we want to rewrite is the bare .svelte module.
			if (id.includes('?')) return null;
			if (!id.endsWith('.svelte')) return null;
			const sveltePath = id;
			const mdPath = baseMdPath(sveltePath, resolved);
			if (!(await fileExists(mdPath))) return null;
			this.addWatchFile(mdPath);
			const mdSource = await readFile(mdPath, 'utf8');
			const runtime: RuntimeConfig = resolved.i18n
				? {
						i18n: true,
						baseLocale: resolved.baseLocale,
						importStatement: resolved.runtimeLocale.importStatement,
						expression: resolved.runtimeLocale.expression
					}
				: { i18n: false };
			const transformed = transformSvelteSource(code, mdSource, mdPath, runtime);
			if (transformed === code) return null;
			return { code: transformed, map: null };
		},

		async resolveId(source, importer) {
			if (source !== VIRTUAL_ID) return null;
			if (!importer) {
				this.error(
					`'${VIRTUAL_ID}' was imported without an importer — it must be imported from a .svelte file.`
				);
				return null;
			}
			const sveltePath = stripQuery(importer);
			if (!sveltePath.endsWith('.svelte')) {
				this.error(`'${VIRTUAL_ID}' must be imported from a .svelte file (got ${sveltePath}).`);
				return null;
			}
			return RESOLVED_PREFIX + sveltePath + RESOLVED_SUFFIX;
		},

		async load(id) {
			if (!id.startsWith(RESOLVED_PREFIX)) return null;
			if (!resolved) throw new Error('marte plugin: configResolved did not run');
			let sveltePath = id.slice(RESOLVED_PREFIX.length);
			if (sveltePath.endsWith(RESOLVED_SUFFIX)) {
				sveltePath = sveltePath.slice(0, -RESOLVED_SUFFIX.length);
			}
			const registerWatch = (mdPath: string) => this.addWatchFile(mdPath);
			const map = resolved.i18n
				? await loadLocaleContent(sveltePath, resolved, registerWatch)
				: await loadSingleContent(sveltePath, registerWatch);
			return `export const marteContent = ${JSON.stringify(map)};\n`;
		},

		handleHotUpdate(ctx) {
			if (!resolved) return;
			const sveltePath = resolved.i18n
				? matchLocaleMd(ctx.file, resolved.locales)
				: matchSingleMd(ctx.file);
			if (!sveltePath) return;
			const virtualId = RESOLVED_PREFIX + sveltePath + RESOLVED_SUFFIX;
			const virtualMod = ctx.server.moduleGraph.getModuleById(virtualId);
			const svelteMods = ctx.server.moduleGraph.getModulesByFile(sveltePath) ?? new Set();
			// Invalidate manually so the next SSR/CSR request re-evaluates them.
			if (virtualMod) ctx.server.moduleGraph.invalidateModule(virtualMod);
			for (const m of svelteMods) ctx.server.moduleGraph.invalidateModule(m);
			// Tell the browser to reload. We can't return [virtualMod, svelteMod]
			// to let Vite do fine-grained HMR: vite-plugin-svelte's hot-update
			// hook would then call transformRequest(ctx.file) and Vite would try
			// to parse the markdown as JS, crashing vite:import-analysis. By
			// returning [] we make svelte's hot-update see no svelteModules and
			// bail out before that path. A copy edit reloading the page is
			// acceptable; granular HMR would need an upstream fix.
			ctx.server.ws.send({ type: 'full-reload' });
			return [];
		}
	};
}

function matchSingleMd(file: string): string | null {
	if (!file.endsWith('.md')) return null;
	return file.slice(0, -'.md'.length) + '.svelte';
}

function matchLocaleMd(file: string, locales: readonly string[]): string | null {
	for (const locale of locales) {
		const suffix = `.${locale}.md`;
		if (file.endsWith(suffix)) {
			return file.slice(0, -suffix.length) + '.svelte';
		}
	}
	return null;
}

async function loadSingleContent(
	sveltePath: string,
	registerWatch: (path: string) => void
): Promise<SelectorMap> {
	const mdPath = baseMdPath(sveltePath, { i18n: false });
	registerWatch(mdPath);
	if (!(await fileExists(mdPath))) return {};
	const mdSource = await readFile(mdPath, 'utf8');
	return buildSelectorMap(mdSource, mdPath);
}

async function loadLocaleContent(
	sveltePath: string,
	resolved: Extract<ResolvedOptions, { i18n: true }>,
	registerWatch: (path: string) => void
): Promise<Record<string, SelectorMap>> {
	const dir = dirname(sveltePath);
	const base = basename(sveltePath, '.svelte');
	const out: Record<string, SelectorMap> = {};
	const present: string[] = [];
	const missing: string[] = [];
	for (const locale of resolved.locales) {
		const mdPath = join(dir, `${base}.${locale}.md`);
		// Register watch even on missing files so a later create triggers HMR.
		registerWatch(mdPath);
		if (!(await fileExists(mdPath))) {
			missing.push(locale);
			continue;
		}
		present.push(locale);
		const mdSource = await readFile(mdPath, 'utf8');
		out[locale] = buildSelectorMap(mdSource, mdPath);
	}
	if (present.length === 0) return out;
	if (missing.length > 0) {
		throw new Error(
			`marte: ${sveltePath} has companions for [${present.join(', ')}] ` +
				`but is missing translations for [${missing.join(', ')}]. ` +
				`Create ${missing
					.map((l) => `${base}.${l}.md`)
					.join(', ')} (or remove the existing companions if this page is not marte-managed).`
		);
	}
	validateLocaleKeyParity(out, sveltePath, resolved.locales);
	return out;
}

function validateLocaleKeyParity(
	maps: Record<string, SelectorMap>,
	sveltePath: string,
	locales: readonly string[]
): void {
	const baseLocale = locales[0];
	const baseKeys = new Set(Object.keys(maps[baseLocale]));
	for (const locale of locales) {
		if (locale === baseLocale) continue;
		const localeKeys = new Set(Object.keys(maps[locale]));
		const missing = [...baseKeys].filter((k) => !localeKeys.has(k));
		const extra = [...localeKeys].filter((k) => !baseKeys.has(k));
		if (!missing.length && !extra.length) continue;
		const parts: string[] = [];
		if (missing.length) parts.push(`  missing in ${locale}: ${missing.join(', ')}`);
		if (extra.length)
			parts.push(`  extra in ${locale} (not in ${baseLocale}): ${extra.join(', ')}`);
		throw new Error(
			`marte: ${sveltePath} locale companions disagree on selectors:\n${parts.join('\n')}`
		);
	}
}

async function resolveOptions(opts: MarteOptions, viteRoot: string): Promise<ResolvedOptions> {
	// Explicit multi-locale list.
	if (opts.locales && opts.locales.length > 1) {
		return makeI18n(opts, opts.locales, opts.baseLocale ?? opts.locales[0], false);
	}
	// Paraglide/inlang project supplies the locales.
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
	// Single-locale (default): one `.md` per `.svelte`, no runtime locale.
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

type ParaglideSettings = {
	baseLocale: string;
	locales: string[];
};

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

function stripQuery(id: string): string {
	const q = id.indexOf('?');
	return q < 0 ? id : id.slice(0, q);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

function baseMdPath(sveltePath: string, resolved: ResolvedOptions): string {
	const dir = dirname(sveltePath);
	const base = basename(sveltePath, '.svelte');
	if (resolved.i18n) return join(dir, `${base}.${resolved.baseLocale}.md`);
	return join(dir, `${base}.md`);
}
