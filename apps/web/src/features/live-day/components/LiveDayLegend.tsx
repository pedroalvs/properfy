import { cn } from '@properfy/frontend-standards';
import type { LiveDayInspectorState } from '@properfy/shared';
import { STATE_VISUALS } from '../lib/stateVisuals';

export interface LegendRoute {
  inspectorId: string;
  inspectorName: string;
  color: string;
}

interface LiveDayLegendProps {
  showAll: boolean;
  routes: LegendRoute[];
}

const STATE_ORDER: LiveDayInspectorState[] = ['NOT_STARTED', 'AT_PROPERTY', 'IN_TRANSIT', 'DONE_FOR_DAY'];

/** Above this many routes, the route legend scrolls instead of growing without bound. */
const ROUTE_SCROLL_THRESHOLD = 12;

/**
 * Map legend. The four inspector states are always shown (icon + text — the
 * colour-blind-safe key to the pins). The per-route colour list only appears
 * with "Show all routes" and is the textual alternative to the line colours
 * (L-F05-12); above 12 routes it scrolls (max 8 rows).
 */
export function LiveDayLegend({ showAll, routes }: LiveDayLegendProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-card-bg/90 p-3 text-sm shadow-lg backdrop-blur-sm">
      <ul className="flex flex-col gap-1" aria-label="States">
        {STATE_ORDER.map((state) => {
          const visual = STATE_VISUALS[state];
          return (
            <li key={state} className="flex items-center gap-2">
              <i className={cn('mdi', visual.icon, 'text-base leading-none', visual.textClass)} aria-hidden="true" />
              <span className="text-text-primary">{visual.label}</span>
            </li>
          );
        })}
      </ul>

      {showAll && routes.length > 0 && (
        <div className="border-t border-border-subtle pt-2">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Routes</p>
          <ul
            aria-label="Route colours"
            className={cn(
              'flex flex-col gap-1',
              routes.length > ROUTE_SCROLL_THRESHOLD && 'max-h-[16rem] overflow-y-auto',
            )}
          >
            {routes.map((route) => (
              <li key={route.inspectorId} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: route.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-text-primary">{route.inspectorName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
