import postcss from 'postcss';
import tailwind from 'tailwindcss';
import tailwindConfig from '../../tailwind.config';

/**
 * Asserts what Tailwind actually *emits*, not what class names the components carry.
 *
 * `bg-primary/10` was once in the source, in the DOM, and in nobody's rendering: the
 * legacy tokens were `var(--color-X)` holding a hex, `parseColor()` could not decompose
 * that into channels, and Tailwind discarded the whole utility without a warning (#1041).
 * A `toContain('bg-primary/10')` assertion on a className passed for the entire life of
 * that bug — which is why this file asserts the compiled RULE, not the class.
 *
 * PR B removed the `--color-*` layer and the `token()` function-colour helper entirely.
 * Every colour is now a shadcn `hsl(var(--x) / <alpha-value>)` token on Tailwind's native
 * `/opacity` path. These assertions guard that path (and are the canary for a tailwindcss
 * minor bump that changes how `<alpha-value>` is substituted).
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
    ['bg-primary/10', 'background-color: hsl(var(--primary) / 0.1)'],
    ['text-secondary/80', 'color: hsl(var(--secondary) / 0.8)'],
    ['bg-accent/10', 'background-color: hsl(var(--accent) / 0.1)'],
    // Off-scale alpha: needs the extended opacity scale (8 is not on Tailwind's default).
    ['bg-primary/8', 'background-color: hsl(var(--primary) / 0.08)'],
  ])('emits a native /opacity rule for %s', async (classes, declaration) => {
    expect(await compile(classes)).toContain(declaration);
  });

  it('emits the focus variant of a ring token', async () => {
    const css = await compile('focus:ring-primary/20');
    expect(css).toContain('--tw-ring-color: hsl(var(--primary) / 0.2)');
  });

  it('colours a box-shadow through the shadow-colour custom property', async () => {
    // `shadow-*/N` lands its value in `--tw-shadow-color`, a path none of the
    // background/text cases reach.
    const css = await compile('shadow-lg shadow-primary/25');
    expect(css).toContain('--tw-shadow-color: hsl(var(--primary) / 0.25)');
  });

  it('keeps literal colours on the native path', async () => {
    // `bg-white/92` was dropped by the *other* half of #1041 — 92 is off Tailwind's
    // default opacity scale — and the extended scale is what revives it. `white` is a
    // real hex, so Tailwind must resolve it to rgb(), never to hsl()/color-mix.
    const css = await compile('bg-white/92');
    expect(css).toContain('rgb(255 255 255 / 0.92)');
    expect(css).not.toContain('color-mix');
  });

  it('leaves un-modified token utilities pointing at the HSL custom property', async () => {
    // The safety property: a plain token utility still resolves to the HSL var.
    expect(await compile('bg-secondary')).toContain('hsl(var(--secondary)');
    expect(await compile('text-accent')).toContain('hsl(var(--accent)');
    // No-alpha utilities take a different code path (`toColorValue`).
    expect(await compile('fill-primary')).toContain('fill: hsl(var(--primary)');
  });

  it('has fully retired the legacy function-colour layer', async () => {
    // The `token()`/`--color-*` path is gone: nothing should emit color-mix (its
    // signature) or reference a `--color-*` variable any more.
    const css = await compile(
      'bg-primary/10 bg-secondary/8 text-accent ring-primary/20 shadow-secondary/25 from-primary',
    );
    expect(css).not.toContain('color-mix');
    expect(css).not.toContain('var(--color-');
  });

  it('builds a gradient transparency fallback with native alpha, not color-mix', async () => {
    // `gradientColorStops` builds the transparent end of a `from-*` via
    // `withAlphaValue(value, 0)`. On the native HSL path that is a clean
    // `hsl(var(--primary) / 0)` — valid everywhere, no color-mix needed (the whole
    // reason the legacy `token()` helper special-cased this).
    const css = await compile('from-primary');
    expect(css).toContain('--tw-gradient-from: hsl(var(--primary)');
    expect(css).toContain('--tw-gradient-to: hsl(var(--primary) / 0)');
    expect(css).not.toContain('color-mix');
  });
});
