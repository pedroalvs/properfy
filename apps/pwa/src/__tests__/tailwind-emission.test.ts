import postcss from 'postcss';
import tailwind from 'tailwindcss';
import tailwindConfig from '../../tailwind.config';

/**
 * Asserts what Tailwind actually *emits*, not what class names the components carry.
 *
 * Most assertions below compiled to an empty stylesheet before the design tokens became
 * function colours (the safety-property and gradient cases are the exceptions — they
 * always emitted, and are here to prove the fix did not disturb them).
 *
 * `bg-primary/10` was in the source, in the DOM, and in nobody's rendering: the tokens
 * are `var(--color-X)` holding a hex, `parseColor()` cannot decompose that into
 * channels, and Tailwind discards the whole utility without a warning (#1041). 253
 * usages across both apps were dead this way.
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

  it('emits an unvariant ring token, which the shell now depends on', async () => {
    // `ring-1 ring-inset ring-primary/20` replaced a hard-coded blue-500 inset shadow on
    // the active bottom-nav tab, and `ring-real-estate/10` an emerald one on the profile
    // avatar. Both are plain (non-variant) ring colours, a shape the focus case above
    // does not cover — a regression here would leave those two elements with no outline.
    const css = await compile('ring-1 ring-inset ring-primary/20 ring-real-estate/10');
    expect(css).toContain('--tw-ring-color: color-mix(in srgb, var(--color-primary) 20%, transparent)');
    expect(css).toContain('--tw-ring-color: color-mix(in srgb, var(--color-real-estate) 10%, transparent)');
    expect(css).toContain('--tw-ring-inset: inset');
  });

  it('keeps literal colours on the native path', async () => {
    // `bg-white/92` was dropped by the *other* half of #1041 — 92 is off Tailwind's
    // default opacity scale — and the extended scale is what revives it. `white` is a
    // real hex, so Tailwind must still resolve it to rgb(), never to color-mix.
    const css = await compile('bg-white/92');
    expect(css).toContain('rgb(255 255 255 / 0.92)');
    expect(css).not.toContain('color-mix');
  });

  it('handles the percentage arbitrary modifier Tailwind documents', async () => {
    // `/[37%]` is already a percentage. Routing it through the `calc(x * 100%)` branch
    // emits `calc(37% * 100%)`, which is invalid — calc cannot multiply two percentages —
    // so the browser drops the declaration and the class is silently dead. That is the
    // #1041 failure mode reintroduced inside its own fix, and it is worse than the status
    // quo because `bg-white/[37%]` works natively.
    const css = await compile('bg-primary/[37%]');
    expect(css).toContain('color-mix(in srgb, var(--color-primary) 37%, transparent)');
    expect(css).not.toContain('calc(37% * 100%)');
  });

  it('colours a box-shadow through the shadow-colour custom property', async () => {
    // `shadow-*/N` has its own emission shape and is live on the auth pages. Its value
    // lands in `--tw-shadow-color`, which is substituted into the composite `box-shadow`,
    // so it exercises a path none of the background/text cases reach.
    const css = await compile('shadow-lg shadow-primary/25');
    expect(css).toContain('--tw-shadow-color: color-mix(in srgb, var(--color-primary) 25%, transparent)');
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
