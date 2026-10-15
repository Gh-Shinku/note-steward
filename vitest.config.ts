import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: `${import.meta.dirname}/tests/obsidian.mock.ts`,
		},
	},
	test: {
		environment: 'happy-dom',
		include: ['tests/**/*.test.ts'],
	},
});
