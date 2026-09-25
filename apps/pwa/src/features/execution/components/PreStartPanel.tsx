import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { GeoLocationCapture } from './GeoLocationCapture';
import { useGeolocation } from '../hooks/useGeolocation';
import type { CapturedLocation } from '../types';

interface PreStartPanelProps {
  propertyAddress: string;
  propertyLatitude?: number | null;
  propertyLongitude?: number | null;
  onStart: (location: CapturedLocation) => void;
  isStarting: boolean;
}

export function PreStartPanel({ propertyAddress, propertyLatitude, propertyLongitude, onStart, isStarting }: PreStartPanelProps) {
  const { location, status, error, requestLocation } = useGeolocation({ autoCapture: true });
  const [addressConfirmed, setAddressConfirmed] = useState(false);

  // Geolocation is mandatory to start: the backend requires start coordinates
  // (start_latitude/start_longitude are NOT NULL). The address-confirm checkbox
  // is an extra confirmation, never a GPS bypass — so when the location is still
  // pending or was denied, spell out that location is required and keep Start
  // disabled, instead of leaving the inspector with a silently-disabled button.
  const awaitingLocation = status === 'idle' || status === 'requesting';

  return (
    <div className="flex flex-col gap-4 px-page-x py-4" data-testid="pre-start-panel">
      <div className="rounded-lg bg-card-bg p-4">
        <h3 className="text-xs font-bold uppercase text-text-secondary">Property</h3>
        <p className="mt-1 text-sm text-text-primary">{propertyAddress}</p>
      </div>

      <GeoLocationCapture
        status={status}
        location={location}
        error={error}
        onRequest={requestLocation}
        propertyLatitude={propertyLatitude}
        propertyLongitude={propertyLongitude}
      />

      <label className="flex items-center gap-3 rounded-lg bg-card-bg p-4" data-testid="address-confirm-label">
        <input
          type="checkbox"
          checked={addressConfirmed}
          onChange={(e) => setAddressConfirmed(e.target.checked)}
          className="h-5 w-5 accent-primary"
          data-testid="address-confirm-checkbox"
        />
        <span className="text-sm text-text-primary">I confirm I am at this address</span>
      </label>

      {!location && (
        <p
          className={`text-xs font-medium ${awaitingLocation ? 'text-text-secondary' : 'text-error'}`}
          data-testid="location-required-note"
        >
          {awaitingLocation
            ? 'Getting your location… Start becomes available once your location is captured.'
            : 'Enable location access to start the inspection. Confirming the address does not start it on its own.'}
        </p>
      )}

      <Button
        variant="primary"
        disabled={!location || isStarting || !addressConfirmed}
        loading={isStarting}
        onClick={() => location && onStart(location)}
        className="!w-full !min-h-[48px]"
        data-testid="start-button"
      >
        <i className="mdi mdi-play-circle-outline text-lg" aria-hidden="true" />
        Start Inspection
      </Button>
    </div>
  );
}
