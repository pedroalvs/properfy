# Contract: HTTP surface deltas

Only behavior and schema deltas; routes, RBAC and error envelopes are otherwise unchanged. OpenAPI + `api-types.ts` regenerated after these changes.

## `PATCH /v1/properties/:propertyId`

- Route/RBAC/request/response shape: **unchanged**. Only latitude/longitude behavior changes:
  - both present, non-null, different from stored (7 dp): `geocodingStatus='MANUAL'`, marker null, no job.
  - both equal to stored: ignored; status + marker unchanged; if address also changed → address-change flow (PENDING + job).
  - both null in a MANUAL property: unlock → PENDING, marker null, job.
  - both null in a non-MANUAL property: ignored (debug `property.update_coordinates_null_ignored`); address-change flow if address changed.
  - incomplete pair (one present, other absent/null): both ignored.
  - Invariant: no branch writes MANUAL with a null coordinate.
- Existing errors unchanged.

## `POST /v1/properties/:propertyId/geocode`

- Contract unchanged: AM/OP; `202 { propertyId, geocodingStatus: 'PENDING' }`; `404 PROPERTY_NOT_FOUND`; `PROPERTY_GEOCODING_MANUAL_OVERRIDE` for MANUAL.
- Change: also clears `geocoding_failure_code`.

## `POST /v1/tenants/:tenantId/branches` and `PATCH /v1/tenants/:tenantId/branches/:branchId`

- RBAC: AM/OP any tenant; CL_ADMIN own tenant only; CL_USER/INSP/TNT → `403 AUTH_FORBIDDEN` "Insufficient permissions".
- Request: `address` = `branchAddressSchema` **without** `latitude/longitude` (Zod strips them if an old client sends them — no 400). Schema stays a plain `z.object` (no top-level `.transform/.refine/.superRefine/.passthrough/.strict`) so F01 can `.extend(...)` it.
- Response 201/200: `addressJson` carries `latitude/longitude` **only** when the permanent geocode succeeded.
- Errors unchanged: `400 VALIDATION_ERROR`; `404 TENANT_NOT_FOUND`; `404 BRANCH_NOT_FOUND`; `409 TENANT_INACTIVE`; `409 BRANCH_NAME_CONFLICT`.
- A geocoding failure NEVER fails the save.

## Import preview schema — `packages/shared/src/schemas/import.ts`

- `geocodeVerificationSchema` `found` variant gains `mode: z.literal('permanent').optional()` (must be declared or serialization strips it). The verifier sets `mode: 'permanent'`.
- Commit: `found` **with** `mode` → SUCCESS + marker; `found` **without** `mode` (pre-deploy) → treated as `unverified` → PENDING, no coords, geocode job enqueued.

## Not exposed

The new DB columns (`geocoded_permanently_at`, `geocoding_failure_code`) are NOT added to any API response or UI.
