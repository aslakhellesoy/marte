import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { marte } from './src/lib/vite.ts';

export default defineConfig({
	plugins: [
		// The library itself, dogfooded by the demo app. The demo runs in i18n
		// mode (en/no) with a tiny local runes locale store as the runtime
		// accessor — see src/demo/locale.svelte.ts. The `$demo` alias is defined
		// in svelte.config.js (kit.alias) so both Vite and svelte-check resolve it.
		marte({
			locales: ['en', 'no'],
			baseLocale: 'en',
			runtimeLocale: {
				importStatement: "import { getLocale } from '$demo/locale.svelte';",
				expression: 'getLocale()'
			}
		}),
		sveltekit()
	]
});
