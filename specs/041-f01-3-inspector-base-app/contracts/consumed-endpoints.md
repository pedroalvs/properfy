# Consumed API contracts (TASK-F01-1 — unchanged by this PR)

This PWA slice consumes the following endpoints shipped by TASK-F01-1. **No contract changes** are made here; `packages/shared/openapi.json` and `packages/shared/src/api-types.ts` are NOT regenerated (verified: `pnpm generate:api` produces no diff before PR).

## `GET /v1/inspectors/me`

- **Auth**: INSP (own profile). 403 `INSP_ONLY` otherwise.
- **Response 200** `{ data: { ...inspector, address, baseLat, baseLng, baseGeocodedAt } }`.
- **Note**: No Fastify response schema — the body is exactly what the use case returns (visibility applied server-side). The PWA types it manually (`useInspectorMe`).
- **Consumer**: `features/profile/hooks/useInspectorMe.ts`, key `['inspector','me',userId]`, staleTime 5 min.

## `PATCH /v1/inspectors/me`

- **Auth**: INSP (own profile).
- **Request**: `inspectorSelfUpdateSchema` + `address: inspectorBaseAddressSchema.optional()`.
- **Response 200** `{ data: { inspectorId, baseGeocodeFailed? } }`.
- **Errors**: 400 `VALIDATION_ERROR` (with `details` mapping to `address.<field>`); 403 `INSP_ONLY` / `AUTH_FORBIDDEN`; 404 `INSPECTOR_NOT_FOUND`; 429 rate-limited (10/min/user).
- **Consumer**: `features/profile/hooks/useUpdateInspectorSelf.ts` — invalidates `['inspector']`, propagates the API message, returns `baseGeocodeFailed`.

## `POST /v1/inspectors/me/app-state`

- **Auth**: INSP (own profile). 403 `INSP_ONLY` otherwise; 404 `INSPECTOR_NOT_FOUND` if soft-deleted.
- **Request**: `inspectorAppStateSchema` `{ displayMode: 'standalone'|'browser', pushPermission: 'granted'|'denied'|'default'|'unsupported', appVersion: string(1..40) }` (strip mode — extra keys dropped).
- **Response 204** (no body). 400 `VALIDATION_ERROR`; 429 rate-limited (10/min/user).
- **Consumer**: `app/useAppStateHeartbeat.ts` (called from `PwaLayout`).
