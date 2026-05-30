<script lang="ts">
	let { children } = $props();
</script>

{@render children()}

<style>
	:global(:root) {
		color-scheme: light;
	}

	:global(*),
	:global(*::before),
	:global(*::after) {
		box-sizing: border-box;
	}

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
		color: #0f172a;
		background: radial-gradient(60rem 60rem at 50% -20rem, #eef2ff 0%, transparent 60%), #ffffff;
		-webkit-font-smoothing: antialiased;
		text-rendering: optimizeLegibility;
	}
</style>
