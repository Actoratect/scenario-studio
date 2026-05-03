// ESLint v9 flat config.
// 詳細: ../Documentation/ScenarioEditor/12_architecture.md, CLAUDE.md
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import solid from 'eslint-plugin-solid/configs/typescript';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/*.tsbuildinfo',
      '**/.pnpm-store/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.es2022, ...globals.browser, ...globals.node },
    },
    rules: {
      // CLAUDE.md: any 禁止
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // SolidJS の JSX 検査は frontend / ui-kit のみ。
    // 本格的な JSX は PoC-A 以降だが、設定は今のうちに固めておく。
    ...solid,
    files: ['packages/{frontend,ui-kit}/**/*.{ts,tsx}'],
  },
);
