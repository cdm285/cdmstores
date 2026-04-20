// @ts-check
import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base recommended rules
  eslint.configs.recommended,

  // TypeScript recommended (without type-checked rules that conflict
  // with explicit cast patterns used in this Cloudflare Workers codebase)
  ...tseslint.configs.recommended,

  // Disable style rules that conflict with Prettier
  prettierConfig,

  // Project-wide configuration — TypeScript source files only
  {
    files: ['**/*.ts'],
    rules: {
      // ── TypeScript ─────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Disabled: conflicts with intentional `as Type` patterns on req.json() / fetch responses
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // ── General ────────────────────────────────────────────────
      'no-console': 'warn',
      'no-debugger': 'error',
      // Disabled: base rule doesn't understand `import type` — TypeScript handles this
      'no-duplicate-imports': 'off',
      // Disabled: TypeScript's type checker handles undefined variables
      'no-undef': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },

  // Type-checked rules — catches async bugs that plain TypeScript cannot detect.
  // Requires parserOptions.projectService so ESLint has full type information.
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // checksVoidReturn: false — async route handlers in Hono/itty-router are intentional
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // Disabled: many agents implement an async interface contract but don't
      // internally await — removing `async` would break the pipeline type signature.
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Ignore build artifacts, test scripts and browser-side JS
  {
    ignores: ['dist/**', 'node_modules/**', '*.mjs', '*.js', 'src/**/*.js'],
  },
);
