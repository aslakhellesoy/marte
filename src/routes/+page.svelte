<script lang="ts">
	import { getLocale, setLocale, type Locale } from '$demo/locale.svelte';
	import Hero from './Hero.svelte';

	const locales: { code: Locale; label: string }[] = [
		{ code: 'en', label: 'English' },
		{ code: 'no', label: 'Norsk' }
	];
</script>

<nav class="switcher">
	<span>Locale:</span>
	{#each locales as { code, label } (code)}
		<button class:active={getLocale() === code} onclick={() => setLocale(code)}>
			{label}
		</button>
	{/each}
</nav>

<!--
	`{#key}` remounts Hero when the locale changes so it re-reads the per-locale
	content map. Editing Hero.en.md / Hero.no.md hot-reloads the page.
-->
{#key getLocale()}
	<Hero />
{/key}

<p class="hint">
	Edit <code>src/routes/Hero.en.md</code> and watch this update. The
	<code>.svelte</code> layout never changes.
</p>

<style>
	.switcher {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		color: #71717a;
	}

	.switcher button {
		border: 1px solid #e4e4e7;
		background: #fff;
		border-radius: 0.375rem;
		padding: 0.25rem 0.625rem;
		cursor: pointer;
	}

	.switcher button.active {
		border-color: #18181b;
		background: #18181b;
		color: #fff;
	}

	.hint {
		margin-top: 2rem;
		font-size: 0.875rem;
		color: #71717a;
	}

	.hint code {
		background: #f4f4f5;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
	}
</style>
