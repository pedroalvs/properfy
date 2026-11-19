# API Contract Delta — Early Offer Access

Only the accept route gains a new response; all other changes are behavioural (an in-window group is simply absent/404 for an under-levelled viewer) and the `earlyAccess.enabledAt` field already exists in the shared schema.

## 1. Accept offer — new `403`

```
POST /v1/marketplace/offers/:id/accept
```

New error response, produced by the shared error handler (NOT declared in the Fastify route schema — no route in this codebase documents 4xx responses, and `openapi.json` has zero error-response keys; a lone declaration would break convention and risk the zod response serializer). The contract below is the documented shape, proven by the route test:

```
403 OFFER_EARLY_ACCESS_ONLY
{
  "error": {
    "code": "OFFER_EARLY_ACCESS_ONLY",
    "message": "This offer opens to all inspectors on Wed 11 Nov at 9:00 am.",
    "details": { "opensAt": "2026-11-10T22:00:00.000Z" }
  }
}
```

- `message`: "This offer opens to all inspectors on {EEE d MMM} at {h:mm a}." — day + time in `PLATFORM_TIMEZONE` (Sydney), identical under any server `TZ`.
- `details.opensAt`: ISO-8601 UTC instant = `published_at + earlyAccess.hours`.
- Raised only for an INSP below level X when the group is in its window (see `isGroupInEarlyAccess`). `acceptOptimistic` is never called in this case.
- Unchanged accept errors (404 not found, 409 already accepted, ineligible, inactive, etc.) keep their current behaviour and order; this check runs after the eligibility checks and before the optimistic accept.

## 2. List / count / detail — behavioural only (no shape change)

```
GET /v1/marketplace/offers           → an in-window group is absent from `data` and from `total` for an under-levelled viewer
GET /v1/marketplace/offers/:id        → in-window group returns the existing 404 MARKETPLACE_OFFER_NOT_FOUND for an under-levelled viewer
```

Request and response schemas are unchanged. A level-≥-X inspector, or any inspector once the window has closed (> H hours), sees today's exact behaviour.

## 3. Platform setting — `earlyAccess.enabledAt` now server-owned

```
GET  /v1/platform-settings/inspectorProgram   → earlyAccess.enabledAt reflects the server-stamped activation instant (or null)
PUT  /v1/platform-settings/inspectorProgram   → earlyAccess.enabledAt is RECOMPUTED by the server; any client value is ignored
```

- The `earlyAccess.enabledAt: string|null` field already exists in `inspectorProgramSettingSchema` (F08-1). No schema change.
- On PUT, the server save-hook sets `enabledAt` per the lifecycle in `data-model.md`. The `platform_setting.updated` audit (produced by F03, `tenantId: null`) carries the server `enabledAt` in `after` (03.A5).

## Regeneration

This slice changes no route schema and no shared schema, so `pnpm generate:api` is expected to produce **no diff**. Run it anyway to confirm `openapi.json`/`api-types.ts` are not stale (CI's `contract-freshness` job gates this), and commit only if something changes.

```
pnpm generate:api   # expected: no change for this feature
```
