import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindConfig from '../../../../tailwind.config';

/**
 * The shell pins elements to the bottom edge of the screen. Because index.html sets
 * `viewport-fit=cover`, that edge is *under* the iOS home indicator, so those elements
 * must reserve `env(safe-area-inset-bottom)`.
 *
 * These assertions exist as a set with the component tests that assert the classes are
 * *used*. No single one is sufficient: `h-18` shipped to production for months because
 * the component referenced a spacing token that was never defined, and Tailwind drops
 * unknown classes silently. The chain has three links — class used, token defined,
 * custom property declared — and breaking any of them fails silently to a 0px inset.
 */
describe('safe-area spacing tokens', () => {
  const spacing = (tailwindConfig.theme?.extend?.spacing ?? {}) as Record<string, string>;

  it.each(['safe-b', 'safe-b-6', 'nav-clear'])('defines the %s spacing token', (token) => {
    expect(spacing[token]).toBeDefined();
  });

  it('derives every safe-area token from the same custom property', () => {
    for (const token of ['safe-b', 'safe-b-6', 'nav-clear']) {
      expect(spacing[token]).toContain('var(--safe-area-bottom)');
    }
  });

  it('declares the custom property the tokens depend on', () => {
    // The tokens reference `var(--safe-area-bottom)` with no fallback, so if this
    // declaration is renamed or dropped every inset computes to 0 and both of the
    // assertions above still pass — the same silent failure `h-18` was.
    const tokensCss = readFileSync(resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
    expect(tokensCss).toContain('--safe-area-bottom: env(safe-area-inset-bottom');
  });
});
