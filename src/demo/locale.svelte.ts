// A tiny runes-based locale store used only by the demo app. It plays the role
// that a real i18n runtime (e.g. Paraglide's `getLocale`) would in a production
// app, and is wired into marte via `runtimeLocale` in vite.config.ts.
//
// It is intentionally outside `src/lib` so it is never published with the
// library.

export type Locale = 'en' | 'no';

let current = $state<Locale>('en');

export function getLocale(): Locale {
	return current;
}

export function setLocale(locale: Locale): void {
	current = locale;
}
