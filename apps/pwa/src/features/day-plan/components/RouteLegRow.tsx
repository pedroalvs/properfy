import { formatLeg } from '../lib/format-route';

interface RouteLegRowProps {
  travelS: number;
  distanceM: number | null;
  /** Wait at the arriving stop (shown as "wait N min for window"). */
  waitS: number;
  /** The leg from the day's origin to the first stop. */
  fromStart?: boolean;
}

/**
 * The travel leg between two stops (or from the origin to the first). Two stops
 * at the same property (0 s / 0 m) render as "Same address" instead of
 * "0 min drive · 0 m" (L-F04-13).
 */
export function RouteLegRow({ travelS, distanceM, waitS, fromStart = false }: RouteLegRowProps) {
  const sameAddress = travelS === 0 && (distanceM === 0 || distanceM === null);
  const text = sameAddress ? 'Same address' : formatLeg({ travelS, distanceM, waitS });
  if (!text) return null;
  return (
    <p className="py-1 pl-10 text-xs text-muted-foreground" data-testid="route-leg">
      {fromStart ? `From start: ${text}` : text}
    </p>
  );
}
