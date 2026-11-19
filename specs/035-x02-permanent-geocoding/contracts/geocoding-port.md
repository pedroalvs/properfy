# Contract: Internal geocoding port & helpers

## Port — `apps/backend/src/modules/property/domain/geocoding.service.ts`

```ts
export type GeocodingMode = 'permanent' | 'temporary';
export interface GeocodeOptions { mode?: GeocodingMode } // absent ⇒ 'permanent'
export interface IGeocodingService {
  geocode(address: string, options?: GeocodeOptions): Promise<GeocodingResult | null>;
}
export class MapboxPermanentGeocodingUnavailableError extends Error {
  readonly code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE';
}
// message: 'Mapbox account does not allow permanent geocoding; no coordinates were stored'
```

`DynamicGeocodingService` (infra) additionally exposes:
```ts
isConfigured(): Promise<boolean>; // (await resolver.getConfig('mapbox')) !== null
```

## Mapbox adapter (external) — confirmed v5 (spike 2026-10-29)

- Request: `GET https://api.mapbox.com/geocoding/v5/mapbox.places/{encodeURIComponent(address)}.json?access_token=…&limit=1&permanent=true`, built with `URLSearchParams`. `permanent` omitted only for `mode: 'temporary'`.
- Success: `features[0].center = [lng, lat]` → `{ lat, lng }`. Empty `features` → `null`.
- Error envelope: `{ "message": string }`. Account error ⇔ status ∈ {401,403,422} AND (`message` contains "permanent" case-insensitive OR the spike refusal format); if not text-distinguishable, 403 alone ⇒ account error. Any other error ⇒ generic `Mapbox geocoding failed with status {code}`.
- Account error is raised OUTSIDE the circuit breaker (sentinel from inside `execute`).
- v6 contingency (not active): `GET https://api.mapbox.com/search/geocode/v6/forward?q=…&limit=1&permanent=true`, coords at `features[0].geometry.coordinates = [lng, lat]`.

## Timeout helper — `.../application/services/geocode-with-timeout.ts`

```ts
export const GEOCODE_SYNC_TIMEOUT_MS = 4000;
export class GeocodeTimeoutError extends Error { readonly code = 'GEOCODE_TIMEOUT'; }
// message: 'Geocoding did not answer within {timeoutMs} ms'
export function geocodeWithTimeout(
  service: IGeocodingService,
  address: string,
  opts?: { mode?: GeocodingMode; timeoutMs?: number }, // defaults: 'permanent', GEOCODE_SYNC_TIMEOUT_MS
): Promise<GeocodingResult | null>;
```
Resolves with result/`null` within the deadline; rejects with `GeocodeTimeoutError` on timeout; passes through service exceptions (incl. the account error) unchanged; swallows a late rejection without unhandled-rejection; always clears the timer.

## Address formatter — `apps/backend/src/shared/domain/geocoding-address.ts`

```ts
export interface GeocodableAddress {
  street: string; number?: string | null; complement?: string | null;
  addressLine2?: string | null; suburb: string; city?: string | null;
  state: string; postcode: string; country: string;
}
export function formatGeocodingQuery(address: GeocodableAddress): string;
export function isSameGeocodingAddress(a: GeocodableAddress, b: GeocodableAddress): boolean;
```
- Order: street, number, complement, addressLine2, suburb, city, state, postcode, country. Each `trim()`-ed; empty/null/undefined omitted; separator `', '`. `city` omitted when equal to `suburb` case-insensitively.
- `isSameGeocodingAddress`: `formatGeocodingQuery(a).trim().toLowerCase() === formatGeocodingQuery(b).trim().toLowerCase()`; extra keys (`latitude`, `longitude`, `formattedAddress`, `provider`) ignored.
- Lock (dec. 23): while `PropertyEntity.fullAddress` exists, `formatGeocodingQuery(entity) === entity.fullAddress`.
