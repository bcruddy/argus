import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,

	// Type-aware linting. Scoped to src/** because it needs the TS program, and the
	// config files at the repo root are not in it. no-floating-promises is the reason
	// this preset is here at all: the codebase is wall-to-wall `await sql` inside loops
	// and one forgotten await silently drops a write.
	{
		files: ['src/**/*.{ts,tsx}'],
		extends: [...tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			// `_name` is the codebase's existing "deliberately unused" convention
			// (see the onError handlers in useFollowedWallets).
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
			],
		},
	},

	eslintConfigPrettier,

	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		'.next/**',
		'out/**',
		'build/**',
		'next-env.d.ts',
		// db-migrate uses CommonJS
		'migrations/**',
	]),
]);

export default eslintConfig;
