/**
 * Properfy frontend standards — shareable ESLint rule fragment (non-visual).
 *
 * Spread `rules` into an app's ESLint config to enforce the codified conventions.
 * This fragment grows as the design-system migration lands each guard. The guards
 * are expressed as `no-restricted-syntax` selectors (ESLint built-in) rather than a
 * bespoke plugin: under ESLint 8 legacy config a scoped package cannot be loaded as
 * a custom-rule plugin without publishing a separate `eslint-plugin-*`, and selectors
 * cover the className/cn() surface we need without that extra package.
 *
 * Guards:
 *  1. no template-literal className (compose with cn()).
 *  2. no raw Tailwind palette colour class (bg-slate-50, text-green-700, …) in
 *     className / cn() — use a design-system token.
 *  3. no arbitrary colour value (text-[#…], bg-[rgb(…)]) in className / cn().
 *
 * Usage (legacy .eslintrc):
 *   const properfy = require('@properfy/frontend-standards/eslint');
 *   module.exports = { rules: { ...properfy.rules } };
 */

// Tailwind default palette families that must never appear raw in app code.
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
// Class-name prefixes that take a colour (kept in sync with the check:ds grep).
const COLOR_PREFIX = 'bg|text|border|ring|from|to|via';

// A string Literal that is (anywhere) inside a `className=` attribute or a `cn(...)`
// call — the two sanctioned places class strings are written.
const CLASS_STRING =
  ":matches(JSXAttribute[name.name='className'], CallExpression[callee.name='cn']) Literal";

// \d (not [0-9]) keeps literal brackets out of the esquery attribute selector.
const noTemplateLiteralClassName = {
  selector: "JSXAttribute[name.name='className'] > JSXExpressionContainer > TemplateLiteral",
  message:
    'No template-literal className — compose classes with cn() from @properfy/frontend-standards.',
};
const noRawPaletteColor = {
  selector: `${CLASS_STRING}[value=/(${COLOR_PREFIX})-(${PALETTE})-\\d/]`,
  message:
    'No raw Tailwind palette colour (e.g. bg-slate-50, text-green-700) in className/cn() — use a design-system token (bg-muted, text-success, text-destructive, text-warning, …).',
};
const noRawArbitraryColor = {
  selector: `${CLASS_STRING}[value=/(${COLOR_PREFIX}|fill|stroke)-\\[(#|rgb|hsl)/]`,
  message:
    'No arbitrary colour value (text-[#…], bg-[rgb(…)]) in className/cn() — use a design-system token.',
};

module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      noTemplateLiteralClassName,
      noRawPaletteColor,
      noRawArbitraryColor,
    ],
  },
  // Exposed so apps can compose selectively and unit tests can assert each guard.
  selectors: { noTemplateLiteralClassName, noRawPaletteColor, noRawArbitraryColor },
};
