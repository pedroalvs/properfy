# API Contracts — F01-1

Error envelope: `{ error: { code, message, details } }`. Zod failures → 400 `VALIDATION_ERROR` ("Request payload is invalid" for body, "Invalid query parameters" for query), `details` = issues. `/v1` prefix. The generated `openapi.json` + `api-types.ts` are the source of truth; these tables are the authoring intent.

## POST /v1/inspectors (altered)

- **Request**: `createInspectorSchema`, `address` **required** (`inspectorBaseAddressSchema`); client `latitude/longitude` stripped.
- **Response 201** `{ data }`: existing fields + `address`, `baseLat`, `baseLng`, `baseGeocodedAt`, `baseGeocodeFailed` + adoption fields (null).
- **Errors**: 400 `VALIDATION_ERROR` (missing/invalid `address`); 409 `INSPECTOR_EMAIL_CONFLICT` ("An inspector with this email already exists"). A geocode failure is **not** an error → 201 with `baseGeocodeFailed: true`.
- **RBAC**: AM, OP. Others → 403 `AUTH_FORBIDDEN`.

## PATCH /v1/inspectors/:inspectorId (altered)

- **Request**: `updateInspectorSchema`; `address` optional, **not** nullable.
- **Response 200** `{ data }`; `baseGeocodeFailed` present only when `address` was sent.
- **Errors**: 400 `VALIDATION_ERROR` (`address:null` → rejected: the base cannot be removed; or invalid shape); 404 `INSPECTOR_NOT_FOUND`.
- **RBAC**: AM, OP.

## PATCH /v1/inspectors/me (altered)

- **Request**: `inspectorSelfUpdateSchema` + optional `address` (`inspectorBaseAddressSchema`).
- **Response 200** `{ data: { inspectorId, baseGeocodeFailed? } }` (no strict response schema — see research R9).
- **Errors**: 400 `VALIDATION_ERROR`; 403 `INSP_ONLY` ("This endpoint is only accessible to inspectors"); 403 `AUTH_FORBIDDEN` ("Inspectors can only update their own profile"); 404 `INSPECTOR_NOT_FOUND`; 429 (10/min **per user**).
- **RBAC**: INSP (own).

## POST /v1/inspectors/me/app-state (new)

- **Request**: `inspectorAppStateSchema` `{ displayMode, pushPermission, appVersion }`.
- **Response 204**, no body.
- **Errors**: 400 `VALIDATION_ERROR`; 403 `INSP_ONLY`; 404 `INSPECTOR_NOT_FOUND` (soft-deleted); 429 (10/min **per user**).
- **RBAC**: INSP (own). Static route wins over `/:inspectorId/...` in find-my-way (test it).

## GET /v1/inspectors (altered)

- **Request**: `listInspectorsQuerySchema` + `missingBaseAddress` (boolean query, `'true'|'false'` coercion).
- **Response 200**: paginated; items filtered by the visibility table.
- **RBAC**: AM/OP — all fields incl. `address` on every item + `missingBaseAddress` filter. CL_* — no `address`/coords/adoption; `missingBaseAddress` ignored. INSP — own record only, with `address`/coords, no adoption.
- **Errors**: 400 `VALIDATION_ERROR` ("Invalid query parameters").

## GET /v1/inspectors/:inspectorId (altered)

- **Response 200** `{ data }` with the same visibility rule.
- **Errors**: 404 `INSPECTOR_NOT_FOUND`; 403 `FORBIDDEN` ("Cannot access another inspector's data") for INSP on another id.

## GET /v1/inspectors/me (altered)

- **Response 200** `{ data }` + `address, baseLat, baseLng, baseGeocodedAt` (no adoption).
- **Errors**: 403 `INSP_ONLY`.

`GET /v1/me` is **unchanged**.

## Shared schema deltas (`packages/shared/src/schemas`)

- `address.ts`: `AU_STATES`, `inspectorBaseAddressSchema`, type `InspectorBaseAddress`.
- `inspector.ts`: `createInspectorSchema.address` (required), `updateInspectorSchema.address`/`inspectorSelfUpdateSchema.address` (optional, non-nullable), `inspectorAppStateSchema`, `listInspectorsQuerySchema.missingBaseAddress`.
- `responses.ts`: `inspectorResponseSchema` + `baseLat`, `baseLng` (nullable number), `baseGeocodedAt`, `appInstalledAt`, `appLastSeenAt` (nullable instant), `pushEnabled` (nullable boolean), `appVersion` (nullable string), `baseGeocodeFailed` (boolean, write responses) — all `.optional()`; `address` stays `z.unknown().optional()`.
