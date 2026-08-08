import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Node environment only: this suite covers the pure logic layer (money math, query
// schemas, grouping, cron auth, fetch retry, formatters). No jsdom, no DB.
export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts', 'src/schemas/**/*.ts', 'src/hooks/**/*.ts'],
		},
	},
});
