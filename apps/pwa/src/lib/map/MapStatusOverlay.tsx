import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MapStatusOverlayProps {
  /** A load/token error message, or null. Takes precedence over the no-pins notice. */
  error: string | null;
  onRetry: () => void;
  /** Show the "nothing to plot" notice (only when there is no error). */
  showNoPins: boolean;
  noPinsMessage: string;
}

/**
 * The map's status overlays, shared by every map: the error/retry panel and the
 * "nothing to plot" notice. Purely presentational — state lives in the owning
 * view. The error is an overlay, never a replacement: the init effect bails out
 * on a missing container before it can clear the error, so unmounting the
 * container to show this would make Retry a dead button.
 */
export function MapStatusOverlay({ error, onRetry, showNoPins, noPinsMessage }: MapStatusOverlayProps) {
  if (error) {
    return (
      <div
        data-testid="map-error"
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted px-6 text-center"
      >
        <AlertCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outlined" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (showNoPins) {
    return (
      <div
        data-testid="map-no-pins"
        className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 px-6 text-center backdrop-blur-sm"
      >
        <p className="text-sm font-medium text-foreground">{noPinsMessage}</p>
      </div>
    );
  }

  return null;
}
