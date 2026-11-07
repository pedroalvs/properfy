import { cn } from '@properfy/frontend-standards';
import type { RouteEtaAccuracy } from '@properfy/shared';

interface RouteEtaAccuracyFooterProps {
  accuracy: RouteEtaAccuracy | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The 30-day route-ETA accuracy line at the foot of the panel (F04). It reads the
 * reliability of the planned ETAs that drive the stop "ETA …" times above.
 */
export function RouteEtaAccuracyFooter({ accuracy, isLoading, isError }: RouteEtaAccuracyFooterProps) {
  let text: string;
  let warning = false;

  if (isLoading) {
    text = 'Route ETA accuracy…';
  } else if (isError || !accuracy) {
    text = 'Route ETA accuracy unavailable';
  } else if (accuracy.sampleSize === 0 || accuracy.meanAbsoluteErrorMinutes == null) {
    text = 'Route ETA accuracy: no data yet';
  } else if (accuracy.status === 'INSUFFICIENT_DATA') {
    text = `Route ETA accuracy: not enough data yet (${accuracy.sampleSize} of ${accuracy.minSampleSize} stops)`;
  } else {
    const mae = accuracy.meanAbsoluteErrorMinutes.toFixed(1);
    text = `Route ETA accuracy (30 days): ${mae} min average error · ${accuracy.sampleSize} stops`;
    if (accuracy.status === 'ABOVE_THRESHOLD') {
      text += ` · Above the ${accuracy.thresholdMinutes} min target`;
      warning = true;
    }
  }

  return (
    <p
      className={cn('border-t border-border-subtle px-4 py-2 text-xs', warning ? 'text-warning' : 'text-text-muted')}
      data-testid="route-eta-accuracy"
    >
      {text}
    </p>
  );
}
