import { globSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type FilePair = {
	readonly svelte: string;
	readonly md: string;
};

export function* walkDir(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name.startsWith('.')) continue;
		const p = join(dir, name);
		const st = statSync(p);
		if (st.isDirectory()) yield* walkDir(p);
		else if (st.isFile()) yield p;
	}
}

export function findPairs(dir: string, ext: string): FilePair[] {
	const pairs: FilePair[] = [];
	for (const p of walkDir(dir)) {
		if (!p.endsWith('.svelte')) continue;
		const md = p.slice(0, -'.svelte'.length) + ext;
		try {
			statSync(md);
			pairs.push({ svelte: p, md });
		} catch {
			/* no companion */
		}
	}
	return pairs;
}

// Resolve a CLI target for `extract` into a list of .svelte files. Literal paths
// are resolved by stat first so parens in SvelteKit group routes (e.g.
// `(marketing)`) don't get interpreted as extglob syntax.
export function resolveExtractTargets(target: string): string[] {
	try {
		const st = statSync(target);
		if (st.isFile()) return target.endsWith('.svelte') ? [target] : [];
		if (st.isDirectory()) {
			return [...walkDir(target)].filter((p) => p.endsWith('.svelte'));
		}
	} catch {
		/* not a literal path — fall through to glob */
	}
	return [...globSync(target)].filter((p) => p.endsWith('.svelte'));
}

export function fileExists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}
