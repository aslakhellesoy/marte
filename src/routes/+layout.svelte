<script lang="ts">
	let { children } = $props();
</script>

<main>
	{@render children()}
</main>

<style>
	:global(body) {
		margin: 0;
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			Helvetica,
			Arial,
			sans-serif;
		color: #18181b;
		background: #fafafa;
	}

	main {
		max-width: 48rem;
		margin: 0 auto;
		padding: 3rem 1.5rem 6rem;
	}
</style>
