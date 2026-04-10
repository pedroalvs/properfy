# Contract: Map Data Endpoints

**Feature**: 016-geospatial-map-experiences
**Type**: Existing REST endpoints with schema additions

## Overview

No new endpoints. This feature requires one schema change to an existing endpoint.

---

## Change: `GET /v1/appointments`

**Current response** (per `appointmentResponseSchema` in `packages/shared/src/schemas/responses.ts`):

```typescript
{
  id: string;
  code: string;
  tenantId: string;
  branchId: string | null;
  propertyId: string | null;
  status: AppointmentStatus;
  // ... existing fields
  // MISSING: latitude, longitude
}
```

**New response** (with added fields):

```typescript
{
  id: string;
  code: string;
  // ... existing fields
  latitude: number | null;     // NEW — propagated from property.lat
  longitude: number | null;    // NEW — propagated from property.lng
}
```

### Behavior

| Scenario | latitude/longitude |
|----------|-------------------|
| Appointment has propertyId and property is geocoded (lat/lng not null) | Populated with the decimal values |
| Appointment has propertyId but property has no coordinates (geocodingStatus !== 'DONE') | `null` |
| Appointment has no propertyId | `null` |
| Appointment's property has coordinates but the frontend passed `hasCoordinates=false` | Still populated (no filtering) |

### Filter: `hasCoordinates=true` (already exists)

When this query param is set, the endpoint filters appointments whose property has non-null `lat` AND non-null `lng`. This already exists and is used by `useAppointmentMapData`.

---

## Unchanged Endpoints

- `GET /v1/properties` — already returns `latitude`, `longitude`. No change.
- `GET /v1/service-groups?includeAppointments=true` — nested appointments inherit the updated schema automatically.
- `GET /v1/service-regions` — returns GeoJSON polygons, already correct.

---

## Backward Compatibility

The new `latitude` and `longitude` fields are **optional and nullable**. Existing consumers (list page, detail page, etc.) will ignore them. No breaking changes.

## Error Handling

No new error conditions. If the backend fails to extract coordinates from the Prisma relation (e.g., property relation not loaded), the fields are `null` — not an error.
