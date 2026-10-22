import type { CapturedLocation } from '../types';
import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { distanceMeters } from '@/lib/geo';

type GeoStatus = 'idle' | 'requesting' | 'success' | 'error' | 'denied';

const DISTANCE_WARNING_THRESHOLD = 200;

interface GeoLocationCaptureProps {
  status: GeoStatus;
  location: CapturedLocation | null;
  error: string | null;
  onRequest: () => void;
  propertyLatitude?: number | null;
  propertyLongitude?: number | null;
  children?: ReactNode;
}

export function GeoLocationCapture({ status, location, error, onRequest, propertyLatitude, propertyLongitude, children }: GeoLocationCaptureProps) {
  const distance =
    location && propertyLatitude != null && propertyLongitude != null
      ? distanceMeters(location.latitude, location.longitude, propertyLatitude, propertyLongitude)
      : null;
  const showDistanceWarning = distance !== null && distance > DISTANCE_WARNING_THRESHOLD;
  const accuracyTone = location
    ? location.accuracy < 10
      ? 'green'
      : location.accuracy < 50
        ? 'amber'
        : 'red'
    : 'gray';

  return (
    <Card data-testid="geo-capture" className="flex flex-col gap-2 p-4">
      <h3 className="text-xs font-bold uppercase text-muted-foreground">Location</h3>

      {status === 'idle' && (
        <Button variant="outlined" block onClick={onRequest} data-testid="geo-request-button">
          <MapPin className="h-5 w-5" aria-hidden="true" />
          Capture Location
        </Button>
      )}

      {status === 'requesting' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="geo-requesting">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          Getting your location...
        </div>
      )}

      {status === 'success' && location && (
        <div className="flex flex-col gap-2" data-testid="geo-success">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Location captured
          </div>
          <Badge tone={accuracyTone} data-testid="accuracy-badge">
            Accuracy: {Math.round(location.accuracy)}m
          </Badge>
          {showDistanceWarning && (
            <Alert tone="warning" data-testid="distance-warning">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <span>
                You are {Math.round(distance!)}m from the property. Are you at the correct location?
              </span>
            </Alert>
          )}
        </div>
      )}

      {(status === 'error' || status === 'denied') && (
        <div className="flex flex-col gap-2" data-testid="geo-error">
          <Alert tone="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span>{error}</span>
          </Alert>
          <Button
            variant="outlined"
            block
            onClick={onRequest}
            data-testid="geo-retry-button"
          >
            Try Again
          </Button>
        </div>
      )}

      {children}
    </Card>
  );
}
