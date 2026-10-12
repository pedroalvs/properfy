import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatWallTimeRange } from '@/lib/format-date';
import type { ExpandedGroup, ExpandedGroupAppointment } from '../lib/offers-map/types';

interface MapOverlaysProps {
  error: string | null;
  onRetry: () => void;
  showNoPinsOverlay: boolean;
  expandedGroup: ExpandedGroup | null;
  selectedAppointment: ExpandedGroupAppointment | null;
  onCloseChip: () => void;
}

/**
 * The overlays stacked on top of the map canvas: the error/retry panel, the
 * "no pins" notice, and the selected-appointment info chip. Purely presentational
 * — all state lives in OffersMapView and its hooks.
 */
export function MapOverlays({
  error,
  onRetry,
  showNoPinsOverlay,
  expandedGroup,
  selectedAppointment,
  onCloseChip,
}: MapOverlaysProps) {
  return (
    <>
      {/*
        The error is an overlay, never a replacement: the init effect bails out
        on a missing container before it reaches setError(null), so unmounting
        the container to show this made Retry a dead button — the map could
        never come back.
      */}
      {error && (
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
      )}
      {!error && showNoPinsOverlay && (
        <div
          data-testid="map-no-pins"
          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-sm"
        >
          <p className="text-sm font-medium text-foreground">
            {expandedGroup ? 'No location data for this group' : 'No offers with location data'}
          </p>
        </div>
      )}
      {selectedAppointment && (
        <div
          data-testid="map-appointment-chip"
          className="absolute inset-x-3 bottom-3 flex items-start justify-between gap-2 rounded-2xl bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">
              {selectedAppointment.street || 'Address unavailable'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{selectedAppointment.suburb}</p>
            <p className="mt-0.5 text-xs font-semibold text-primary">
              {formatWallTimeRange(selectedAppointment.timeSlotStart, selectedAppointment.timeSlotEnd)}
            </p>
          </div>
          <button
            data-testid="map-appointment-chip-close"
            aria-label="Close appointment info"
            onClick={onCloseChip}
            className="min-h-touch min-w-touch -mr-2 -mt-1 inline-flex items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
