import { useState } from 'react';
import { MapPin, Play } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
      <Card className="flex items-start gap-3 p-4">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase text-muted-foreground">Property</h3>
          <p className="text-sm text-foreground">{propertyAddress}</p>
        </div>
      </Card>

      <GeoLocationCapture
        status={status}
        location={location}
        error={error}
        onRequest={requestLocation}
        propertyLatitude={propertyLatitude}
        propertyLongitude={propertyLongitude}
      />

      <label className="flex items-center gap-3 rounded-card border border-border bg-card p-4" data-testid="address-confirm-label">
        <input
          type="checkbox"
          checked={addressConfirmed}
          onChange={(e) => setAddressConfirmed(e.target.checked)}
          className="h-5 w-5 accent-primary"
          data-testid="address-confirm-checkbox"
        />
        <span className="text-sm text-foreground">I confirm I am at this address</span>
      </label>

      <p className="text-xs text-muted-foreground">
        We capture your location to confirm you&apos;re on site. This starts the inspection — no
        checklist or photos are required.
      </p>

      {!location && (
        <p
          className={cn(
            'text-xs font-medium',
            awaitingLocation ? 'text-muted-foreground' : 'text-destructive',
          )}
          data-testid="location-required-note"
        >
          {awaitingLocation
            ? 'Getting your location… Start becomes available once your location is captured.'
            : 'Enable location access to start the inspection. Confirming the address does not start it on its own.'}
        </p>
      )}

      <Button
        variant="success"
        block
        disabled={!location || isStarting || !addressConfirmed}
        loading={isStarting}
        onClick={() => location && onStart(location)}
        data-testid="start-button"
      >
        <Play className="h-5 w-5" aria-hidden="true" />
        Start inspection
      </Button>
    </div>
  );
}
