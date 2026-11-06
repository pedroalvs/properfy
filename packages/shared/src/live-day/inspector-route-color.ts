/**
 * Stable per-inspector route colour for the Live Day map and list (F05, D6).
 *
 * Each colour has contrast >= 4.5:1 against both `#FFFFFF` and `#F2EFE9` (the
 * light background of the Mapbox `streets-v12` basemap), which clears the WCAG
 * 1.4.11 3:1 minimum for graphics and is AA for text (the list dot sits beside
 * the name). The 12 indices are ordered (L-F05-12) so neighbouring indices
 * alternate hue family and lightness; colour alone does not distinguish routes,
 * so the real differentiation is the route name on hover and the textual legend.
 *
 * `mapbox` is comma-form HSL for Mapbox paint; `hex` is for CSS (dot, pin
 * border, legend). Never space-form `hsl(a b c)` (Mapbox bug, #1302).
 */

export interface InspectorRouteColor {
  mapbox: string;
  hex: string;
  index: number;
}

export const INSPECTOR_ROUTE_PALETTE: readonly InspectorRouteColor[] = [
  { index: 0, mapbox: 'hsl(45, 90%, 26%)', hex: '#7E6007' },
  { index: 1, mapbox: 'hsl(250, 55%, 45%)', hex: '#4934B2' },
  { index: 2, mapbox: 'hsl(25, 85%, 32%)', hex: '#97460C' },
  { index: 3, mapbox: 'hsl(275, 55%, 40%)', hex: '#6F2E9E' },
  { index: 4, mapbox: 'hsl(200, 85%, 30%)', hex: '#0B628E' },
  { index: 5, mapbox: 'hsl(305, 55%, 35%)', hex: '#8A2882' },
  { index: 6, mapbox: 'hsl(90, 60%, 25%)', hex: '#406619' },
  { index: 7, mapbox: 'hsl(330, 70%, 36%)', hex: '#9C1C5C' },
  { index: 8, mapbox: 'hsl(175, 80%, 22%)', hex: '#0B655E' },
  { index: 9, mapbox: 'hsl(220, 75%, 40%)', hex: '#194CB3' },
  { index: 10, mapbox: 'hsl(145, 65%, 24%)', hex: '#156537' },
  { index: 11, mapbox: 'hsl(0, 70%, 38%)', hex: '#A51D1D' },
] as const;

/**
 * FNV-1a 32-bit hash of the inspector id → palette index. Stable across
 * sessions, browsers and deploys (the same inspector always gets the same
 * colour). Collisions are possible above 12 inspectors and are accepted: the
 * name sits next to the colour in the list and legend.
 */
export function inspectorRouteColorIndex(inspectorId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < inspectorId.length; i++) {
    h ^= inspectorId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % INSPECTOR_ROUTE_PALETTE.length;
}

export function inspectorRouteColor(inspectorId: string): InspectorRouteColor {
  return INSPECTOR_ROUTE_PALETTE[inspectorRouteColorIndex(inspectorId)]!;
}
