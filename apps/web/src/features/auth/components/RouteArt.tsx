/**
 * "The Round" — the day's inspection route, as the signed-out brand pane's artwork.
 *
 * Inline SVG rather than an asset in `public/` because the pins take the coral brand
 * token, which a flat file cannot follow. Purely decorative: the pane hosting it is
 * `aria-hidden` and the form sheet beside it already names the product, so nothing here
 * is titled or described.
 *
 * The viewBox is portrait to match the 39.5%-wide, full-height pane, and the caller
 * slices it rather than fitting it — the round should read large and get cropped by the
 * pane edge, not shrink into a column.
 *
 * The route is a single `<path>` with `pathLength="1"`, which is what lets the load
 * reveal animate `stroke-dashoffset` from 1 to 0 without knowing the curve's real
 * length. Reshape the round freely; the animation follows. The corollary is that the
 * route can never be dashed — `stroke-dasharray` is spoken for.
 */

interface Stop {
  /** Rendered as the eyebrow. Order is the information — see the labelling test. */
  numeral: string;
  name: string;
  x: number;
  y: number;
  labelX: number;
  anchor: 'start' | 'end';
  /** Lifts a label clear of the route where the curve would otherwise run through it. */
  labelDy?: number;
}

/**
 * Sydney suburbs, in the order an operator would run them. The platform is
 * Sydney-only (`PLATFORM_TIMEZONE`), so the geography is the real one.
 */
export const ROUTE_STOPS: readonly Stop[] = [
  { numeral: '01', name: 'Newtown', x: 118, y: 168, labelX: 142, anchor: 'start', labelDy: -26 },
  { numeral: '02', name: 'Surry Hills', x: 330, y: 290, labelX: 354, anchor: 'start' },
  { numeral: '03', name: 'Paddington', x: 196, y: 440, labelX: 220, anchor: 'start' },
  { numeral: '04', name: 'Bondi Junction', x: 372, y: 560, labelX: 348, anchor: 'end' },
  { numeral: '05', name: 'Randwick', x: 214, y: 700, labelX: 238, anchor: 'start' },
];

/**
 * The round deliberately ends around y=700 of a 900-unit box. The bottom fifth is the
 * lockup's band — the artwork is fitted, not cropped, so that reserve holds at every
 * pane height instead of only the tall ones.
 */
const ROUTE_PATH = [
  'M118 168',
  'C210 200 268 226 330 290',
  'C300 350 232 380 196 440',
  'C250 500 344 500 372 560',
  'C344 630 254 645 214 700',
].join(' ');

/** Streets the round does not use — they give the route something to be a choice against. */
const CONTEXT_ROADS = [
  'M-620 60C120 130 250 118 1140 210',
  'M-620 420C140 356 300 404 1140 340',
  'M-620 720C160 646 300 700 1140 640',
  'M78 -520C104 200 60 470 132 1420',
  'M418 -520C392 240 448 520 390 1420',
];

/**
 * Inks. Tints of --color-secondary rather than the token itself: on the pale pane every
 * layer has to sit at a different depth, and the token is only one of those depths.
 * Written as raw rgb() because Tailwind's opacity scale is guarded by
 * src/__tests__/opacity-scale.test.ts and these values are not on it.
 */
const INK = {
  grid: 'rgb(33 86 110 / 0.10)',
  context: 'rgb(33 86 110 / 0.16)',
  route: 'rgb(33 86 110 / 0.55)',
  halo: 'rgb(243 122 118 / 0.26)',
  label: 'rgb(33 86 110 / 0.78)',
};

const GRID_STEP = 65;
const VIEW_W = 520;
const VIEW_H = 900;

/**
 * The grid and the context roads are drawn far outside the viewBox on purpose.
 *
 * The pane is a fixed 39.5% of the window but a free height, so its aspect ratio moves
 * constantly. `slice` would keep the field full-bleed but crop the round — on a short
 * laptop window the first and last stops fall off the canvas entirely. `meet` keeps the
 * whole round on screen at every height, at the cost of leaving gutters where the
 * viewBox does not reach. Overdrawing the background layers and letting the SVG overflow
 * fills those gutters, so the field still bleeds to all four pane edges.
 */
const BLEED = 620;

function backgroundLines() {
  const verticals = [];
  for (let x = -BLEED; x < VIEW_W + BLEED; x += GRID_STEP) verticals.push(x);

  const horizontals = [];
  for (let y = -BLEED; y < VIEW_H + BLEED; y += GRID_STEP) horizontals.push(y);

  return { verticals, horizontals };
}

export function RouteArt({ className }: { className?: string }) {
  const { verticals, horizontals } = backgroundLines();

  return (
    <svg
      data-testid="route-art"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className={`overflow-visible ${className ?? ''}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g data-testid="route-grid" className="auth-reveal-structure" stroke={INK.grid} strokeWidth={1}>
        {verticals.map((x) => (
          <line key={`v${x}`} x1={x} y1={-BLEED} x2={x} y2={VIEW_H + BLEED} />
        ))}
        {horizontals.map((y) => (
          <line key={`h${y}`} x1={-BLEED} y1={y} x2={VIEW_W + BLEED} y2={y} />
        ))}
      </g>

      <g
        className="auth-reveal-context"
        fill="none"
        stroke={INK.context}
        strokeWidth={2}
        strokeLinecap="round"
      >
        {CONTEXT_ROADS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <path
        data-testid="route-path"
        className="auth-reveal-route"
        d={ROUTE_PATH}
        pathLength={1}
        fill="none"
        stroke={INK.route}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g className="auth-reveal-stops">
        {ROUTE_STOPS.map((stop) => (
          <g key={stop.name} data-testid="route-stop">
            <circle cx={stop.x} cy={stop.y} r={11} fill="none" stroke={INK.halo} strokeWidth={1.5} />
            <circle cx={stop.x} cy={stop.y} r={5} fill="var(--color-real-estate)" />
          </g>
        ))}
      </g>

      <g className="auth-reveal-labels" fontFamily="Poppins, sans-serif">
        {ROUTE_STOPS.map((stop) => (
          <g key={stop.name} data-testid="route-label">
            <text
              x={stop.labelX}
              y={stop.y - 4 + (stop.labelDy ?? 0)}
              textAnchor={stop.anchor}
              fill="var(--color-secondary)"
              fontSize={9}
              fontWeight={600}
              letterSpacing={1.4}
            >
              {stop.numeral}
            </text>
            <text
              x={stop.labelX}
              y={stop.y + 12 + (stop.labelDy ?? 0)}
              textAnchor={stop.anchor}
              fill={INK.label}
              fontSize={15}
              fontWeight={600}
            >
              {stop.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
