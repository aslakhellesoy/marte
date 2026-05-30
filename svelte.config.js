import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			// Demo-only runtime locale store, used by the marte plugin's injected
			// `runtimeLocale.importStatement` in vite.config.ts.
			$demo: 'src/demo'
		}
	}
};

export default config;
