import { describe, it, expect } from 'vitest';
import { hslTripletToMapboxColor } from '../useOfferRoute';

describe('hslTripletToMapboxColor', () => {
  // Regression: the shadcn `--primary` triplet is space-separated, and Mapbox's
  // paint parser rejects the CSS Color 4 space form `hsl(221 83% 53%)` with
  // "color expected", which fired map 'error' and showed "Map failed to load".
  it('converts a space-separated shadcn HSL triplet to the comma form Mapbox accepts', () => {
    expect(hslTripletToMapboxColor('221 83% 53%')).toBe('hsl(221, 83%, 53%)');
  });

  it('trims surrounding whitespace from the token value', () => {
    expect(hslTripletToMapboxColor('  221 83% 53%  ')).toBe('hsl(221, 83%, 53%)');
  });

  it('never emits the space syntax Mapbox rejects', () => {
    const out = hslTripletToMapboxColor('221 83% 53%');
    // No "<number> <percent>" run inside the hsl() — that is the form that errors.
    expect(out).not.toMatch(/\d\s+\d/);
    expect(out).not.toMatch(/%\s+\d/);
  });

  it('falls back to the brand hex when the token is absent', () => {
    expect(hslTripletToMapboxColor('')).toBe('#2563EB');
    expect(hslTripletToMapboxColor('   ')).toBe('#2563EB');
  });
});
