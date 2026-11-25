import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '.tools/**', '**/dist/**', 'release/**', 'apps/mobile/android/**'] },
  ...tseslint.configs.recommended,
  { files: ['**/*.mjs', '**/*.cjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', module: 'readonly', require: 'readonly', __dirname: 'readonly', URL: 'readonly' } } },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
