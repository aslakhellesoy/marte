import { defineConfig } from 'vitest/config';

// Unit tests for the library are plain Node modules (Markdown/AST/transform).
// They use svelte/compiler (and, in vite.test.ts, the vite Plugin types), so we
// resolve Svelte's server/node conditions and let Vitest inline svelte.
export default defineConfig({
	resolve: {
		conditions: ['node', 'svelte', 'default']
	},
	ssr: {
		resolve: {
			conditions: ['node', 'svelte', 'default']
		}
	},
	test: {
		include: ['src/lib/**/*.test.ts'],
		environment: 'node',
		server: {
			deps: {
				inline: ['svelte']
			}
		}
	}
});
