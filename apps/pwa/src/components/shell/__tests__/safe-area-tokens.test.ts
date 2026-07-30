import tailwindConfig from '../../../../tailwind.config';

/**
 * The shell pins elements to the bottom edge of the screen. Because index.html sets
 * `viewport-fit=cover`, that edge is *under* the iOS home indicator, so those elements
 * must reserve `env(safe-area-inset-bottom)`.
 *
 * These assertions exist as a pair with the component tests that assert the classes are
 * *used*. Neither half is sufficient alone: `h-18` shipped to production for months
 * because the component referenced a spacing token that was never defined, and Tailwind
 * drops unknown classes silently.
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

  it('leaves the bottom nav height to its content instead of a fixed token', () => {
    // The nav used to hard-code `h-18`, which Tailwind never defined. Re-introducing an
    // `18` token would silently revive that class and make the bar 89px tall, taller than
    // the clearance the layout reserves.
    expect(spacing['18']).toBeUndefined();
  });
});
