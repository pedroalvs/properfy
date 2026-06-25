import { useState, useCallback, useEffect, useRef } from 'react';
import type { CapturedLocation } from '../types';

type GeoStatus = 'idle' | 'requesting' | 'success' | 'error' | 'denied';

interface UseGeolocationOptions {
  autoCapture?: boolean;
}

interface UseGeolocationReturn {
  location: CapturedLocation | null;
  status: GeoStatus;
  error: string | null;
  requestLocation: () => void;
}

export function useGeolocation(options: UseGeolocationOptions = {}): UseGeolocationReturn {
  const { autoCapture = false } = options;
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setError('Geolocation is not supported by this browser');
      return;
    }

    setStatus('requesting');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
        setStatus('success');
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location permission denied. Please enable location access in your browser settings.');
        } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          setStatus('error');
          setError('Location unavailable. Please try again.');
        } else {
          setStatus('error');
          setError('Location request timed out. Please try again.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  }, []);

  const autoCaptured = useRef(false);
  useEffect(() => {
    if (autoCapture && !autoCaptured.current) {
      autoCaptured.current = true;
      requestLocation();
    }
  }, [autoCapture, requestLocation]);

  return { location, status, error, requestLocation };
}
