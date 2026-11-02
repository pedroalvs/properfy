/**
 * shadcn stores `--primary` as a space-separated HSL triplet ("221 83% 53%").
 * Mapbox's paint color parser rejects the CSS Color 4 space syntax
 * (`hsl(221 83% 53%)` → "color expected") and needs the legacy comma form
 * (`hsl(221, 83%, 53%)`), so convert the triplet rather than wrapping it as-is.
 * Falls back to the brand hex when the token is absent (SSR / jsdom).
 */
export function hslTripletToMapboxColor(raw: string): string {
  const triplet = raw.trim();
  if (!triplet) return '#2563EB';
  return `hsl(${triplet.replace(/\s+/g, ', ')})`;
}

/** A Mapbox paint property needs a concrete colour; read `--primary` at call time. */
export function resolvePrimaryColor(): string {
  if (typeof document === 'undefined') return '#2563EB';
  return hslTripletToMapboxColor(getComputedStyle(document.documentElement).getPropertyValue('--primary'));
}
