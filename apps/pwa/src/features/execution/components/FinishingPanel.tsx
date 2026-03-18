import { Button } from '@/components/ui/Button';
import { GeoLocationCapture } from './GeoLocationCapture';
import { useGeolocation } from '../hooks/useGeolocation';
import type { CapturedLocation, ChecklistResponse, AssetUploadState } from '../types';

interface FinishingPanelProps {
  checklistCount: number;
  assetCount: number;
  notes: string;
  onSubmit: (location: CapturedLocation) => void;
  isSubmitting: boolean;
}

export function FinishingPanel({
  checklistCount,
  assetCount,
  notes,
  onSubmit,
  isSubmitting,
}: FinishingPanelProps) {
  const { location, status, error, requestLocation } = useGeolocation();

  return (
    <div className="flex flex-col gap-4 px-page-x py-4" data-testid="finishing-panel">
      <h2 className="text-lg font-bold text-secondary">Finish Inspection</h2>

      <div className="rounded-lg bg-card-bg p-4">
        <h3 className="text-xs font-bold uppercase text-text-secondary">Summary</h3>
        <div className="mt-2 flex flex-col gap-1 text-sm text-text-primary">
          <div className="flex justify-between">
            <span>Checklist items</span>
            <span className="font-semibold">{checklistCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Photos</span>
            <span className="font-semibold">{assetCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Notes</span>
            <span className="font-semibold">{notes ? 'Added' : 'None'}</span>
          </div>
        </div>
      </div>

      <GeoLocationCapture
        status={status}
        location={location}
        error={error}
        onRequest={requestLocation}
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
