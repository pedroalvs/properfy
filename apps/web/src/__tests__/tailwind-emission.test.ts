import { describe, it, expect } from 'vitest';
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
 * warning (#1041). 253 usages across this app and `apps/pwa` were dead this way — the
 * map filter panel had no background over live tiles, `Button`'s outlined and delete
 * variants had no hover or press state, and a disabled Publish button was pixel-identical
 * to an enabled one.
 *
 * A `toContain('bg-primary/10')` assertion on a className passed for the entire life of
 * that bug, which is why this file asserts on compiled CSS instead.
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
    // The map filter panel, floating over live Mapbox tiles.
    ['bg-card-bg/95', 'background-color: color-mix(in srgb, var(--color-card-bg) 95%, transparent)'],
    // `Button` outlined hover — dead app-wide until the config fix.
    ['bg-primary/5', 'background-color: color-mix(in srgb, var(--color-primary) 5%, transparent)'],
    [
      'border-border-light/70',
      'border-color: color-mix(in srgb, var(--color-border-light) 70%, transparent)',
    ],
    // Off-scale alpha: needs BOTH the function colour and the extended opacity scale.
    ['bg-primary/8', 'background-color: color-mix(in srgb, var(--color-primary) 8%, transparent)'],
  ])('emits a rule for %s', async (classes, declaration) => {
    expect(await compile(classes)).toContain(declaration);
  });

  it('emits the disabled and hover variants that made a disabled button look enabled', async () => {
    // `GroupMapDetailPanel`'s Publish button carries `bg-real-estate` plus
    // `hover:bg-real-estate/90` and `disabled:bg-real-estate/40`. The base survived and
    // both modifiers were dropped, so the disabled button rendered identically to the
    // enabled one.
    const css = await compile('hover:bg-real-estate/90 disabled:bg-real-estate/40');
    expect(css).toContain('color-mix(in srgb, var(--color-real-estate) 90%, transparent)');
    expect(css).toContain('color-mix(in srgb, var(--color-real-estate) 40%, transparent)');
  });

  it('keeps literal colours on the native path', async () => {
    // The login hero's `bg-white/6`, `bg-white/12` and `text-white/88` were dropped by
    // the *other* half of #1041 — those numbers are off Tailwind's default opacity
    // scale — and the extended scale is what revives them. `white` is a real hex, so
    // Tailwind must still resolve it to rgb(), never to color-mix.
    const css = await compile('bg-white/6 bg-white/12 text-white/88');
    expect(css).toContain('rgb(255 255 255 / 0.06)');
    expect(css).toContain('rgb(255 255 255 / 0.12)');
    expect(css).toContain('rgb(255 255 255 / 0.88)');
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
