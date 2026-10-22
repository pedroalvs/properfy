const properfy = require('@properfy/frontend-standards/eslint');

/**
 * Feature-boundary enforcement (no-restricted-imports).
 *
 * A file under `features/<X>` must not import from `features/<Y>` (X≠Y), and
 * `components/ui/**` must not import from `features/**`. Shared code belongs in
 * `components/`, `hooks/` or `lib/`.
 *
 * The ONE sanctioned exception is the schedule↔execution coupling (SchedulePage /
 * AppointmentDetailPage reach into execution; ExecutionPage reaches into schedule).
 * That is deferred known-debt — the rule is scoped so it does not force that
 * refactor now: the schedule override omits `execution` from its ban and vice-versa.
 */
const CROSS_FEATURE_MESSAGE =
  'Cross-feature import: features must not import from another feature — move shared code to components/, hooks/ or lib/. (schedule↔execution is the only sanctioned, deferred exception.)';
const featureGroup = (name) => `@/features/${name}/**`;
// Features with no legitimate cross-feature import today: ban all of them.
const ALL_FEATURES = ['auth', 'schedule', 'offers', 'execution', 'earnings', 'profile'];
const banFeatures = (names) => [
  'error',
  { patterns: [{ group: names.map(featureGroup), message: CROSS_FEATURE_MESSAGE }] },
];

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
    // Canonical design-system bans (`no-restricted-syntax`) at `error`:
    // template-literal className, raw palette colour, arbitrary colour value.
    ...properfy.rules,
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    // Features with no legitimate cross-feature import: ban importing any feature.
    {
      files: ['src/features/auth/**', 'src/features/offers/**', 'src/features/earnings/**', 'src/features/profile/**'],
      rules: { 'no-restricted-imports': banFeatures(ALL_FEATURES) },
    },
    // schedule may reach into execution (deferred coupling); ban the rest.
    {
      files: ['src/features/schedule/**'],
      rules: { 'no-restricted-imports': banFeatures(ALL_FEATURES.filter((f) => f !== 'execution' && f !== 'schedule')) },
    },
    // execution may reach into schedule (deferred coupling); ban the rest.
    {
      files: ['src/features/execution/**'],
      rules: { 'no-restricted-imports': banFeatures(ALL_FEATURES.filter((f) => f !== 'schedule' && f !== 'execution')) },
    },
    // Design-system primitives must never depend on a feature.
    {
      files: ['src/components/ui/**'],
      rules: { 'no-restricted-imports': banFeatures(ALL_FEATURES) },
    },
  ],
  env: {
    node: true,
    es2022: true,
  },
};
