import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// For project GitHub Pages the site is served from /<repo>, so the build needs
// a base path. The deploy workflow sets BASE_PATH; dev/local builds use root.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		paths: { base },
		alias: {
			// Demo-only runtime locale store, used by the marte plugin's injected
			// `runtimeLocale.importStatement` in vite.config.ts.
			$demo: 'src/demo'
		}
	}
};

export default config;
