import { defineConfig } from 'vitest/config';

// Unit tests for the library are plain Node modules (parsing, AST, transforms)
// and do not need the SvelteKit plugin pipeline, so they run in isolation from
// vite.config.ts for speed and determinism.
export default defineConfig({
	test: {
		include: ['src/lib/**/*.test.ts'],
		environment: 'node'
	}
});
