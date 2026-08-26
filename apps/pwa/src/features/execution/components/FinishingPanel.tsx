import { Button } from '@/components/ui/Button';
import { GeoLocationCapture } from './GeoLocationCapture';
import { useGeolocation } from '../hooks/useGeolocation';
import type { CapturedLocation } from '../types';

interface FinishingPanelProps {
  onSubmit: (location: CapturedLocation) => void;
  isSubmitting: boolean;
  propertyLatitude?: number | null;
  propertyLongitude?: number | null;
}

export function FinishingPanel({
  onSubmit,
  isSubmitting,
  propertyLatitude,
  propertyLongitude,
}: FinishingPanelProps) {
  const { location, status, error, requestLocation } = useGeolocation({ autoCapture: true });

  return (
    <div className="flex flex-col gap-4 px-page-x py-4" data-testid="finishing-panel">
      <h2 className="text-lg font-bold text-secondary">Finish Inspection</h2>

      <p className="text-sm text-text-muted">
        Confirm your location at the property to complete this inspection.
      </p>

      <GeoLocationCapture
        status={status}
        location={location}
        error={error}
        onRequest={requestLocation}
        propertyLatitude={propertyLatitude}
        propertyLongitude={propertyLongitude}
      />

      <Button
        variant="primary"
        disabled={!location || isSubmitting}
        loading={isSubmitting}
        onClick={() => location && onSubmit(location)}
        className="!w-full !min-h-[48px]"
        data-testid="submit-button"
      >
        <i className="mdi mdi-check-circle-outline text-lg" aria-hidden="true" />
        Submit Inspection
      </Button>
    </div>
  );
}
