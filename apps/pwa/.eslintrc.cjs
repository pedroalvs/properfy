const properfy = require('@properfy/frontend-standards/eslint');

/**
 * PWA-local ESLint config.
 *
 * Faithfully mirrors the repository-root `.eslintrc.json` (same parser, plugins,
 * extends, parserOptions, env and rule levels) so PWA linting stays behaviourally
 * identical to the rest of the monorepo — with ONE deliberate difference: the
 * template-literal-className ban is wired in from the canonical
 * `@properfy/frontend-standards/eslint` fragment at `error`, rather than the root's
 * inlined `warn`.
 *
 * The root keeps that rule at `warn` because `apps/web` still carries legacy
 * template-literal classNames; the PWA source is fully migrated to `cn()`, so the
 * canonical `error` level is enforceable here now. `root: true` stops ESLint from also
 * loading the repository-root config for PWA files.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Canonical template-literal-className ban (`no-restricted-syntax`) at `error`.
    ...properfy.rules,
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  env: {
    node: true,
    es2022: true,
  },
};
