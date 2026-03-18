import { env } from '../../config/env';

interface MapboxPreviewProps {
  latitude: number;
  longitude: number;
  height?: number;
  showGoogleMapsLink?: boolean;
}

const GOOGLE_MAPS_BASE = 'https://www.google.com/maps?q=';

export function MapboxPreview({
  latitude,
  longitude,
  height = 200,
  showGoogleMapsLink = true,
}: MapboxPreviewProps) {
  const token = env.mapboxToken;
  const googleMapsUrl = `${GOOGLE_MAPS_BASE}${latitude},${longitude}`;

  const hasToken = Boolean(token);

  return (
    <div className="flex flex-col gap-2">
      {hasToken ? (
        <img
          src={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+009DD9(${longitude},${latitude})/${longitude},${latitude},14,0/${400}x${height}@2x?access_token=${token}`}
          alt={`Map showing location at ${latitude}, ${longitude}`}
          className="w-full rounded object-cover"
          style={{ height }}
          data-testid="mapbox-static-image"
        />
      ) : (
        <div
          className="flex items-center justify-center rounded bg-app-bg"
          style={{ height }}
          data-testid="mapbox-fallback"
        >
          <span className="text-sm text-text-secondary">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        </div>
      )}

      {showGoogleMapsLink && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          data-testid="google-maps-link"
        >
          <span className="mdi mdi-open-in-new text-xs" />
          Open in Google Maps
        </a>
      )}
    </div>
  );
}
