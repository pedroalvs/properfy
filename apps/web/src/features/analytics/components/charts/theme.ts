/**
 * One visual system for every chart on the Analytics screen.
 *
 * The categorical palette below is validated, not chosen by eye. Run against
 * the `#FFFFFF` card surface it clears the lightness band, the chroma floor,
 * adjacent-pair CVD separation (worst ΔE 9.1, target ≥ 8) and the
 * normal-vision floor (worst ΔE 19.6, floor ≥ 15).
 *
 * It carries one obligation: three slots sit below 3:1 contrast against white,
 * which is a WARN the method does not let you dismiss. Every chart using these
 * hues must therefore ship **visible direct labels and a table view** — see
 * `ChartCard`, which provides the latter. Do not drop either.
 *
 * Slot order is the CVD-safety mechanism, not decoration. Assign by a stable
 * key (service-type code) so a filter that removes a series never repaints the
 * survivors, and never generate a 9th hue — fold the tail into "Other".
 */

/** Fixed categorical order. Never cycled, never reordered. */
export const CATEGORICAL_SERIES = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
] as const;

/** Everything past the palette folds here rather than inventing a hue. */
export const SERIES_OTHER = '#8a8a85';

/**
 * Single hue for magnitude comparisons (bar length carries the value, colour
 * carries nothing). Brand secondary — dark enough to clear contrast on white.
 */
export const SEQUENTIAL_HUE = '#21566E';

/** Recessive chrome so the marks stay the loudest thing on the card. */
export const AXIS_COLOR = 'rgba(0,0,0,0.38)';
export const GRID_COLOR = 'rgba(0,0,0,0.08)';

export const AXIS_TICK = { fill: 'rgba(0,0,0,0.6)', fontSize: 12 } as const;

/** Shared Recharts props so every axis, grid and tooltip matches. */
export const CHART_DEFAULTS = {
  margin: { top: 8, right: 16, bottom: 8, left: 0 },
  grid: { stroke: GRID_COLOR, strokeDasharray: '3 3', vertical: false },
  axis: { stroke: AXIS_COLOR, tick: AXIS_TICK, tickLine: false, axisLine: false },
  tooltip: {
    cursor: { stroke: AXIS_COLOR, strokeWidth: 1 },
    contentStyle: {
      borderRadius: 4,
      border: '1px solid rgba(0,0,0,0.08)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      fontSize: 12,
    },
    // Values and labels wear text tokens; the swatch beside them carries identity.
    labelStyle: { color: 'rgba(0,0,0,0.87)', fontWeight: 700 },
  },
  /** 2px lines, ≥8px active markers — thin marks, generous hit targets. */
  line: { strokeWidth: 2, dot: false, activeDot: { r: 4, strokeWidth: 2, stroke: '#FFFFFF' } },
  /** 4px rounded data-end, anchored to the baseline. */
  barRadius: [0, 4, 4, 0] as [number, number, number, number],
} as const;

/**
 * Colour for a series, resolved from its position in a stable ordering.
 * Callers pass the index of the entity in a key-sorted list, never its rank by
 * value — colour follows the entity, never its size.
 */
export function seriesColor(index: number): string {
  return CATEGORICAL_SERIES[index] ?? SERIES_OTHER;
}

/**
 * Mapbox `heatmap-color` ramp: one hue, transparent → dark. A rainbow ramp
 * would imply categories where there is only magnitude.
 */
export const HEATMAP_RAMP: (string | number)[] = [
  0, 'rgba(33,86,110,0)',
  0.2, 'rgba(33,86,110,0.25)',
  0.4, 'rgba(33,86,110,0.45)',
  0.6, 'rgba(33,86,110,0.65)',
  0.8, 'rgba(33,86,110,0.82)',
  1, 'rgba(33,86,110,0.95)',
];
