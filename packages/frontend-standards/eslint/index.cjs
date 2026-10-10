/**
 * Properfy frontend standards — shareable ESLint rule fragment (non-visual).
 *
 * Spread `rules` into an app's ESLint config to enforce the codified conventions.
 * This fragment grows as the design-system migration lands each guard; the first rule
 * bans hand-built className template literals (compose with `cn()` instead).
 *
 * Usage (legacy .eslintrc):
 *   const properfy = require('@properfy/frontend-standards/eslint');
 *   module.exports = { rules: { ...properfy.rules } };
 */
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "JSXAttribute[name.name='className'] > JSXExpressionContainer > TemplateLiteral",
        message:
          'No template-literal className — compose classes with cn() from @properfy/frontend-standards.',
      },
    ],
  },
};
