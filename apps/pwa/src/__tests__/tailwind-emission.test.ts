import postcss from 'postcss';
import tailwind from 'tailwindcss';
import tailwindConfig from '../../tailwind.config';

/**
 * Asserts what Tailwind actually *emits*, not what class names the components carry.
 *
 * Every assertion below compiled to an empty stylesheet before the design tokens became
 * function colours. `bg-primary/10` was in the source, in the DOM, and in nobody's
 * rendering: the tokens are `var(--color-X)` holding a hex, `parseColor()` cannot
 * decompose that into channels, and Tailwind discards the whole utility without a
 * warning (#1041). 253 usages across both apps were dead this way.
 *
 * A `toContain('bg-primary/10')` assertion on a className passed for the entire life of
 * that bug, which is why this file exists — it is the second link in the same chain that
 * `components/shell/__tests__/safe-area-tokens.test.ts` describes: the class is used
 * *and* the class compiles to a rule.
 *
 * This file is also the guard for a Tailwind upgrade. `token()` in tailwind.config.ts
 * depends on how tailwindcss calls a function colour, which is internal behaviour, not
 * public API — so `tailwindcss` is deliberately left on a caret range and these
 * assertions are what catch a minor bump that changes it. If they fail after an upgrade,
 * re-read `util/withAlphaVariable.js` and `util/pluginUtils.js` before touching them.
 */
async function compile(classes: string): Promise<string> {
  const result = await postcss([
    tailwind({
      ...tailwindConfig,
      content: [{ raw: classes, extension: 'html' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css;
}

describe('tailwind token emission', () => {
  it.each([
    ['bg-primary/10', 'background-color: color-mix(in srgb, var(--color-primary) 10%, transparent)'],
    ['bg-app-bg/80', 'background-color: color-mix(in srgb, var(--color-app-bg) 80%, transparent)'],
    [
      'border-border-subtle/70',
      'border-color: color-mix(in srgb, var(--color-border-subtle) 70%, transparent)',
    ],
    // Off-scale alpha: needs BOTH the function colour and the extended opacity scale.
    ['bg-error/8', 'background-color: color-mix(in srgb, var(--color-error) 8%, transparent)'],
  ])('emits a rule for %s', async (classes, declaration) => {
    expect(await compile(classes)).toContain(declaration);
  });

  it('emits the focus variant of a ring token', async () => {
    const css = await compile('focus:ring-primary/20');
    expect(css).toContain('--tw-ring-color: color-mix(in srgb, var(--color-primary) 20%, transparent)');
  });

  it('keeps literal colours on the native path', async () => {
    // `bg-white/92` was dropped by the *other* half of #1041 — 92 is off Tailwind's
    // default opacity scale — and the extended scale is what revives it. `white` is a
    // real hex, so Tailwind must still resolve it to rgb(), never to color-mix.
    const css = await compile('bg-white/92');
    expect(css).toContain('rgb(255 255 255 / 0.92)');
    expect(css).not.toContain('color-mix');
  });

  it('leaves un-modified token utilities pointing straight at the custom property', async () => {
    // The safety property. Making the colour a function must not change what a plain
    // token utility resolves to, or this fix would repaint the entire app.
    expect(await compile('bg-primary')).toContain('background-color: var(--color-primary)');
    expect(await compile('text-error')).toContain('color: var(--color-error)');
    expect(await compile('border-border-subtle')).toContain('border-color: var(--color-border-subtle)');
    // Utilities with no alpha support take a different code path (`toColorValue`, which
    // calls the colour function with no arguments at all).
    expect(await compile('fill-primary')).toContain('fill: var(--color-primary)');
  });

  it('does not put color-mix in a gradient transparency fallback', async () => {
    // `gradientColorStops` builds the transparent end of a `from-*` via
    // `withAlphaValue(value, 0)` — passing the NUMBER 0, not a string. A colour helper
    // that assumes a string crashes the build here, and one that returns color-mix puts
    // it inside `--tw-gradient-to`, which would invalidate the whole linear-gradient on
    // a browser without color-mix support — breaking a utility that works today.
    // `from-shimmer-from` is live in `components/feedback/LoadingState.tsx`.
    const css = await compile('from-shimmer-from');
    expect(css).toContain('--tw-gradient-to: transparent');
    expect(css).not.toContain('--tw-gradient-to: color-mix');
  });
});
