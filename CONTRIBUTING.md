# Contributing to malte

Thanks for your interest in malte! This document covers local development and
the release process for maintainers.

## Development

Requires Node.js 20+ and [pnpm](https://pnpm.io) 10+.

```sh
pnpm install           # install dependencies
pnpm dev               # run the SvelteKit demo app
pnpm test              # run unit tests once
pnpm test:watch        # watch mode
pnpm check             # svelte-check + tsc
pnpm lint              # prettier + eslint
pnpm format            # prettier --write
pnpm build:lib         # build the publishable library into dist/
```

The library source lives in `src/lib/`. The Vite plugin entry is
`src/lib/vite.ts`, the CLI entry is `src/lib/bin.ts`, and the public API
re-exports are in `src/lib/index.ts`.

## Commit messages

Releases use [Conventional Commits](https://www.conventionalcommits.org) with
the Angular preset. The version bump and `CHANGELOG.md` entries are derived
from the commits since the last tag.

| Prefix              | Effect                            |
| ------------------- | --------------------------------- |
| `feat: …`           | Minor version bump (new feature)  |
| `fix: …`            | Patch version bump (bug fix)      |
| `perf: …`           | Patch bump (performance)          |
| `docs: …`           | No bump; appears in changelog     |
| `refactor: …`       | No bump; appears in changelog     |
| `chore: …`          | No bump; usually not in changelog |
| `BREAKING CHANGE:` in body | Major version bump         |

Example:

```
feat: add data-marte-each region for repeatable blocks

BREAKING CHANGE: renames the deprecated data-marte-block attribute.
```

## Release process

Releases are cut from a maintainer's terminal — not from CI — so you can enter
the npm 2FA OTP interactively.

### Prerequisites

1. You're a maintainer on the [`malte` npm package](https://www.npmjs.com/package/malte).
2. You're logged in: `pnpm whoami` returns your npm username. If not, run
   `pnpm login`.
3. Your npm account has 2FA enabled (recommended). Have your authenticator app
   ready.
4. You're on `main` with a clean working tree and your local branch is in sync
   with `origin/main`.

### Cutting a release

```sh
pnpm release
```

This runs [release-it](https://github.com/release-it/release-it) which will:

1. Run `pnpm lint`, `pnpm check`, and `pnpm test`.
2. Determine the next version from your commit messages (Angular preset).
3. Update `CHANGELOG.md` and `package.json` version.
4. Build the library (`pnpm build:lib` via `prepublishOnly`).
5. Prompt for your npm 2FA OTP.
6. Publish to npm.
7. Commit, tag (`v<version>`), and push the tag and commit to `origin/main`.

You'll be asked to confirm each step interactively. To preview without making
changes:

```sh
pnpm release --dry-run
```

### First release

The very first publish needs an explicit version (conventional-changelog can't
infer one without a prior tag):

```sh
pnpm release 0.0.1
```

Subsequent releases use plain `pnpm release` and the bump is inferred from
commit history.

### Releasing a prerelease

```sh
pnpm release --preRelease=next     # e.g. 0.2.0-next.0, published under the "next" dist-tag
```

### If something goes wrong

- **Tests failed before bump**: nothing was published. Fix and re-run.
- **Publish failed after bump**: `package.json` and `CHANGELOG.md` may be
  dirty. Either re-run `pnpm release` (it picks up the bumped version), or
  `git checkout -- package.json CHANGELOG.md` and start over.
- **Tag pushed but publish failed**: `git push --delete origin v<version>`,
  delete the local tag, fix the issue, re-run.
- **Published a broken version**: deprecate it on npm
  (`npm deprecate malte@<version> "broken, use <next> instead"`) and release
  a fixed version. Do not unpublish — it breaks downstream lockfiles.
