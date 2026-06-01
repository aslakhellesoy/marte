import { readFileSync, writeFileSync } from 'node:fs';
import { SyncError } from './errors.ts';
import { extractFromSource } from './extract.ts';
import { fileExists, findPairs, resolveExtractTargets } from './files.ts';
import { checkSvelteSource, transformSvelteSource } from './transform.ts';

type CliArgs = {
	_: string[];
	dir?: string;
	ext?: string;
	locale?: string;
	force?: boolean;
	dry?: boolean;
};

function parseArgs(argv: readonly string[]): CliArgs {
	const args: CliArgs = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--dir') args.dir = argv[++i];
		else if (argv[i] === '--ext') args.ext = argv[++i];
		else if (argv[i] === '--locale') args.locale = argv[++i];
		else if (argv[i] === '--force') args.force = true;
		else if (argv[i] === '--dry') args.dry = true;
		else args._.push(argv[i]);
	}
	return args;
}

const USAGE =
	'usage:\n' +
	'  malte check   [--dir src] [--locale en | --ext .md]\n' +
	'  malte apply   [--dir src] [--locale en | --ext .md]\n' +
	'  malte extract <file|dir|glob> [--locale en | --ext .md] [--force] [--dry]\n' +
	'\n' +
	'  Default companion extension is ".md". --locale L sets it to ".L.md".';

// Single-locale by default (Foo.md). --locale L => Foo.L.md; --ext overrides.
function pickExt(args: CliArgs): string {
	if (args.ext) return args.ext;
	if (args.locale) return `.${args.locale}.md`;
	return '.md';
}

export function runCli(argv: readonly string[]): never {
	const args = parseArgs(argv);
	const cmd = args._[0];
	const dir = args.dir ?? 'src';
	const ext = pickExt(args);

	if (cmd !== 'check' && cmd !== 'apply' && cmd !== 'extract') {
		console.error(USAGE);
		process.exit(2);
	}
	if (cmd === 'extract') runExtract(args, ext);
	else runCheckOrApply(cmd, dir, ext);
	process.exit(0);
}

function runExtract(args: CliArgs, ext: string): void {
	const target = args._[1];
	if (!target) {
		console.error('extract needs a .svelte file, directory, or glob');
		process.exit(2);
	}
	const files = resolveExtractTargets(target);
	if (!files.length) {
		console.error(`no .svelte files matched ${target}`);
		process.exit(1);
	}
	let written = 0;
	let skipped = 0;
	let failed = 0;
	let unverified = 0;
	for (const file of files) {
		try {
			const svelteSrc = readFileSync(file, 'utf8');
			const mdFile = file.slice(0, -'.svelte'.length) + ext;
			const result = extractFromSource(file, svelteSrc, mdFile, {
				force: args.force,
				dry: args.dry,
				existing: fileExists
			});
			result.warnings.forEach((w) => console.error(`  ! ${w}`));
			if (args.dry) {
				console.log(`--- ${result.mdFile}\n${result.md}`);
				if (result.svelteChanged) {
					console.error(`  (would add ${result.markersAdded} data-malte marker(s) to ${file})`);
				}
			} else {
				writeFileSync(result.mdFile, result.md);
				written++;
				console.log(`✎ wrote ${result.mdFile}`);
				if (result.svelteChanged) {
					writeFileSync(file, result.svelte);
					console.log(`✎ added ${result.markersAdded} data-malte marker(s) to ${file}`);
				}
			}
			if (result.verified) console.log(`✓ verified against ${file}`);
			else {
				console.error(`⚠ ${file}: does not resolve yet — ${result.verifyMsg}`);
				unverified++;
			}
		} catch (e) {
			if (e instanceof SyncError && /already exists/.test(e.message) && !args.force) {
				console.log(`· ${file} — companion exists, skipping (use --force to overwrite)`);
				skipped++;
				continue;
			}
			if (e instanceof SyncError && /no extractable text/.test(e.message)) {
				console.log(`· ${file} — no extractable text, skipping`);
				skipped++;
				continue;
			}
			failed++;
			console.error(`✗ ${file} — ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	if (files.length > 1 || skipped || failed || unverified) {
		console.log(
			`\n${written} written, ${skipped} skipped, ${unverified} unverified, ${failed} failed`
		);
	}
	if (failed || unverified) process.exit(1);
}

function runCheckOrApply(cmd: 'check' | 'apply', dir: string, ext: string): void {
	const pairs = findPairs(dir, ext);
	if (!pairs.length) {
		console.log(`No .svelte files with a companion ${ext} found under ${dir}/`);
		return;
	}
	let failed = 0;
	let changed = 0;
	for (const pair of pairs) {
		try {
			const svelteSrc = readFileSync(pair.svelte, 'utf8');
			const mdSrc = readFileSync(pair.md, 'utf8');
			if (cmd === 'check') {
				const n = checkSvelteSource(svelteSrc, mdSrc, pair.md);
				console.log(`✓ ${pair.svelte}  (${n} marker${n === 1 ? '' : 's'})`);
			} else {
				const next = transformSvelteSource(svelteSrc, { '': mdSrc }, { i18n: false }, pair.md);
				if (next !== svelteSrc) {
					writeFileSync(pair.svelte, next);
					changed++;
					console.log(`✎ ${pair.svelte}`);
				} else {
					console.log(`· ${pair.svelte}  (up to date)`);
				}
			}
		} catch (e) {
			failed++;
			if (e instanceof SyncError) console.error(`✗ ${e.message}`);
			else console.error(`✗ ${pair.svelte} — ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	if (failed) {
		console.error(`\n${failed} file(s) failed.`);
		process.exit(1);
	}
	if (cmd === 'apply') console.log(`\nDone. ${changed} file(s) updated.`);
	else console.log(`\nAll ${pairs.length} file(s) valid.`);
}
