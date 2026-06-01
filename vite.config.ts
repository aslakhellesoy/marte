import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { malte } from './src/lib/vite.ts';

export default defineConfig({
	plugins: [
		// The library itself, dogfooded by the demo app. The demo runs in i18n
		// mode (en/no) with a tiny local runes locale store as the runtime
		// accessor — see src/demo/locale.svelte.ts. The `$demo` alias is defined
		// in svelte.config.js (kit.alias) so both Vite and svelte-check resolve it.
		malte({
			locales: ['en', 'no'],
			baseLocale: 'en',
			runtimeLocale: {
				// Aliased so it never collides with a page's own `getLocale` import.
				importStatement: "import { getLocale as __malteLocale } from '$demo/locale.svelte';",
				expression: '__malteLocale()'
			}
		}),
		sveltekit()
	]
});
