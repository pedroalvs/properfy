import type { CapturedLocation } from '../types';
import type { ReactNode } from 'react';

type GeoStatus = 'idle' | 'requesting' | 'success' | 'error' | 'denied';

interface GeoLocationCaptureProps {
  status: GeoStatus;
  location: CapturedLocation | null;
  error: string | null;
  onRequest: () => void;
  children?: ReactNode;
}

export function GeoLocationCapture({ status, location, error, onRequest, children }: GeoLocationCaptureProps) {
  return (
    <div data-testid="geo-capture" className="rounded-lg bg-card-bg p-4">
      <h3 className="text-xs font-bold uppercase text-text-secondary">Location</h3>

      {status === 'idle' && (
        <button
          onClick={onRequest}
          className="mt-2 flex min-h-touch w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary/5 text-sm font-semibold text-primary"
          data-testid="geo-request-button"
        >
          <i className="mdi mdi-crosshairs-gps text-lg" aria-hidden="true" />
          Capture Location
        </button>
      )}

      {status === 'requesting' && (
        <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary" data-testid="geo-requesting">
          <i className="mdi mdi-loading mdi-spin text-primary" />
          Getting your location...
        </div>
      )}

      {status === 'success' && location && (
        <div className="mt-2" data-testid="geo-success">
          <div className="flex items-center gap-2 text-sm text-success">
            <i className="mdi mdi-check-circle" />
            Location captured
          </div>
          <span
            className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-semibold ${
              location.accuracy < 10
                ? 'bg-success/10 text-success'
                : location.accuracy < 50
                  ? 'bg-warning/10 text-warning'
                  : 'bg-error/10 text-error'
            }`}
            data-testid="accuracy-badge"
          >
            Accuracy: {Math.round(location.accuracy)}m
          </span>
        </div>
      )}

      {(status === 'error' || status === 'denied') && (
        <div className="mt-2" data-testid="geo-error">
          <div className="flex items-center gap-2 text-sm text-error">
            <i className="mdi mdi-alert-circle" />
            {error}
          </div>
          {status === 'error' && (
            <button
              onClick={onRequest}
              className="mt-2 text-sm font-semibold text-primary"
              data-testid="geo-retry-button"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
