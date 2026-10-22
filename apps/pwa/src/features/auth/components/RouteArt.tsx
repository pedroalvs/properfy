/**
 * "The Round" — the day's inspection route, as the auth hero's artwork.
 *
 * Ported from apps/web's RouteArt, adapted for the PWA's dark teal hero: the route and
 * structure inks are white (the web draws teal ink on a pale pane, which would vanish
 * here), while the stop pins keep the coral accent. The hero is a bespoke "splash" surface
 * that deliberately sits outside the app's (now blue) design tokens, so its teal and coral
 * are literal values here, not token references.
 *
 * Purely decorative — the svg is `aria-hidden` and the sheet beside it carries the real
 * heading — so nothing here is titled or described.
 *
 * The route is a single `<path>` with `pathLength={1}`, which lets the load reveal animate
 * `stroke-dashoffset` from 1 to 0 without knowing the curve's real length (see
 * styles/auth-pane.css). The corollary: the route can never be dashed.
 *
 * The composition is kept to the centre of the viewBox and fitted with `slice` (cover),
 * so it fills both the short mobile band and the tall lg pane with good-sized marks; the
 * overdrawn grid and context roads bleed past the viewBox to reach every edge under the
 * crop.
 */

interface Stop {
  /** The pin's number and the label's eyebrow. Order is the information. */
  numeral: string;
  name: string;
  x: number;
  y: number;
  labelX: number;
  anchor: 'start' | 'end';
}

/** Sydney suburbs, in the order an operator would run them (the platform is Sydney-only). */
export const ROUTE_STOPS: readonly Stop[] = [
  { numeral: '01', name: 'Newtown', x: 150, y: 470, labelX: 168, anchor: 'start' },
  { numeral: '02', name: 'Surry Hills', x: 250, y: 380, labelX: 268, anchor: 'start' },
  { numeral: '03', name: 'Paddington', x: 330, y: 300, labelX: 348, anchor: 'start' },
  { numeral: '04', name: 'Bondi Junction', x: 420, y: 210, labelX: 402, anchor: 'end' },
  { numeral: '05', name: 'Randwick', x: 470, y: 120, labelX: 452, anchor: 'end' },
];

const ROUTE_PATH = [
  'M150 470',
  'C200 430 212 420 250 380',
  'S312 332 330 300',
  'S402 250 420 210',
  'S462 162 470 120',
].join(' ');

/** Streets the round does not use — they give the route something to be a choice against. */
const CONTEXT_ROADS = [
  'M-200 200 C150 260 360 236 820 300',
  'M-200 430 C180 476 380 442 820 452',
  'M120 -200 C160 180 118 430 200 820',
  'M450 -200 C416 200 476 460 430 820',
];

const GRID_STEP = 60;
const VIEW = 600;
/** Overdraw the background so it still reaches every edge once `slice` crops the viewBox. */
const BLEED = 200;

function backgroundLines() {
  const lines: number[] = [];
  for (let n = -BLEED; n < VIEW + BLEED; n += GRID_STEP) lines.push(n);
  return lines;
}

export function RouteArt({ className }: { className?: string }) {
  const lines = backgroundLines();

  return (
    <svg
      data-testid="route-art"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g
        data-testid="route-grid"
        className="auth-reveal-structure"
        stroke="#ffffff"
        strokeOpacity={0.07}
        strokeWidth={1}
      >
        {lines.map((x) => (
          <line key={`v${x}`} x1={x} y1={-BLEED} x2={x} y2={VIEW + BLEED} />
        ))}
        {lines.map((y) => (
          <line key={`h${y}`} x1={-BLEED} y1={y} x2={VIEW + BLEED} y2={y} />
        ))}
      </g>

      <g
        className="auth-reveal-context"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.11}
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
        stroke="#ffffff"
        strokeOpacity={0.5}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g className="auth-reveal-stops">
        {ROUTE_STOPS.map((stop, index) => (
          <g key={stop.name} data-testid="route-stop">
            <circle
              cx={stop.x}
              cy={stop.y}
              r={18}
              fill="none"
              stroke="#F37A76"
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />
            <circle cx={stop.x} cy={stop.y} r={11} fill="#F37A76" />
            <text
              x={stop.x}
              y={stop.y + 4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={800}
              fill="#ffffff"
            >
              {index + 1}
            </text>
          </g>
        ))}
      </g>

      <g className="auth-reveal-labels auth-route-labels">
        {ROUTE_STOPS.map((stop) => (
          <g key={stop.name} data-testid="route-label">
            <text
              x={stop.labelX}
              y={stop.y - 5}
              textAnchor={stop.anchor}
              fill="#ffffff"
              fillOpacity={0.55}
              fontSize={9}
              fontWeight={700}
              letterSpacing={1.4}
            >
              {stop.numeral}
            </text>
            <text
              x={stop.labelX}
              y={stop.y + 11}
              textAnchor={stop.anchor}
              fill="#ffffff"
              fillOpacity={0.72}
              fontSize={14}
              fontWeight={700}
            >
              {stop.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
