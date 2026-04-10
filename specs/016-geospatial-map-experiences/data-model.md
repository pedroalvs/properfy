# Data Model: Geospatial Map Experiences

**Feature**: 016-geospatial-map-experiences
**Date**: 2026-04-10

## Entities

### 1. Property (existing, no schema change)

The canonical source of point coordinates. Already has `lat` and `lng` fields.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope |
| `lat` | Decimal(10,7) nullable | Latitude — populated by geocoding worker |
| `lng` | Decimal(10,7) nullable | Longitude — populated by geocoding worker |
| `geocodingStatus` | enum nullable | `PENDING`, `DONE`, `FAILED` |

**No changes.**

### 2. Appointment (existing, no schema change)

References Property via `propertyId`. Currently the list endpoint does not propagate property coordinates to the response.

**Change**: The `findAll()` repository method must include `property.lat` and `property.lng` in the select clause. The use case must map them to top-level `latitude`/`longitude` fields in the output (mirroring what `findById()` already does).

| Derived Field (in API response) | Type | Source |
|---------------------------------|------|--------|
| `latitude` | number \| null | `property.lat` converted from Decimal |
| `longitude` | number \| null | `property.lng` converted from Decimal |

### 3. AppointmentResponse (shared Zod schema)

**File**: `packages/shared/src/schemas/responses.ts`

**Change**: Add two optional fields to `appointmentResponseSchema`:

```typescript
latitude: z.number().nullable().optional(),
longitude: z.number().nullable().optional(),
```

**Rationale**: Optional so existing consumers don't break; nullable for appointments with properties that haven't been geocoded yet.

---

## Frontend Map Data Contracts

### AppointmentMapItem (already exists)

**File**: `apps/web/src/features/appointments/hooks/useAppointmentMapData.ts`

Already defines:
```typescript
interface AppointmentMapItem {
  id: string;
  code: string;
  status: AppointmentStatus;
  address: string;
  latitude: number | null;
  longitude: number | null;
  scheduledDate: string;
  timeSlot: string | null;
  inspectorName: string | null;
  branchName: string | null;
}
```

**No change**. This interface is the target the backend must match.

### PropertyMapItem (already exists)

Already receives coordinates correctly from the backend. No change needed.

### ServiceGroupMapItem (already exists)

Nested appointments will automatically receive coordinates once the backend fix is in place, because the service group endpoint reuses appointment serialization.

---

## Bounds Calculation (new utility)

### `computeBounds` function

**File**: `apps/web/src/lib/map-bounds.ts` (new)

**Signature**:
```typescript
import type { LngLatBoundsLike } from 'mapbox-gl';

export interface PointLike {
  latitude: number | null;
  longitude: number | null;
}

export function computeBounds(points: PointLike[]): LngLatBoundsLike | null {
  // Returns null if no valid points, otherwise a [[sw_lng, sw_lat], [ne_lng, ne_lat]] tuple
}
```

**Validation rules**:
- Skip points with `null` latitude or longitude
- Return `null` if zero valid points (caller keeps default center)
- Return a degenerate bounds (sw === ne) for a single valid point (caller can use `flyTo` instead)
- Coordinates must be within valid ranges: latitude ∈ [-90, 90], longitude ∈ [-180, 180]

---

## Relationships

```
Property (1) ─── lat, lng ───> exposed in AppointmentResponse as latitude/longitude
Appointment (1) ──── propertyId ──> Property
ServiceGroup (1) ──── nested ──> Appointment[] (inherits coordinate fields)

Frontend:
  useAppointmentMapData() ──> GET /v1/appointments?hasCoordinates=true ──> AppointmentMapItem[]
  computeBounds(items) ──> LngLatBoundsLike | null
  map.fitBounds(bounds, { padding: 50 })
```

## Database Changes

**None.** All required columns already exist.

## State Transitions

None. This feature is read-only for map data consumption.
