# HTTP Contract (consumed, not defined) — F07-3

All three routes are already implemented and merged (F07-2 / F03). This feature only **calls** them through the typed `openapi-fetch` client; it regenerates no `api-types.ts`.

## `GET /v1/dashboard/inspector-performance`

- **Auth**: AM/OP only (route returns 403 for CL/INSP; web also guards with `AuthGuard roles={[AM, OP]}`).
- **Response 200**: `ReliabilityRankingResponse` (see `data-model.md`).
- **Web usage**: `useReliabilityRanking` → `api.GET('/v1/dashboard/inspector-performance')`, queryKey `['reliability','ranking']`, throw on `error`, unwrap `data`.
- **Empty**: `snapshotDate: null` with empty `ranked`/`notEnoughData` → page empty state.

## `GET /v1/dashboard/inspector-performance/{inspectorId}`

- **Auth**: AM/OP only.
- **Params**: `inspectorId` (uuid). Non-uuid → 400; unknown/soft-deleted → 404.
- **Response 200**: `InspectorReliabilityResponse` (see `data-model.md`), `metrics` = eight `ReliabilityMetricResult & { weight }` in canonical order; `NOT_COMPUTED` → `metrics: []`.
- **Web usage**: `useInspectorReliability(id)` → `api.GET('/v1/dashboard/inspector-performance/{inspectorId}', { params: { path: { inspectorId: id } } })`, queryKey `['reliability','inspector', id]`, `enabled: !!id`. 400/404 → drawer "We couldn't find this inspector."

## `GET /v1/platform-settings/reliabilityIndex` and `PUT /v1/platform-settings/reliabilityIndex`

- **Auth**: `GET` AM/OP; `PUT` per F03 rule (AM and OP). The web section never hides the link (L-F07-11).
- **GET 200**: `{ key, value, updatedAt, ... }` where `value` matches the `reliabilityIndex` setting shape (eight weights, `minimumVolume`, `volumeReferenceOverride`, `minimumRatings`) via `usePlatformSetting('reliabilityIndex')`.
- **PUT body**: the full `value` object. **200** → snackbar "Reliability settings saved. Scores are being recalculated." + invalidate `['reliability']`. **422/400** → `error.details` mapped to fields, else generic banner.

## Status transition (existing route, unchanged) — reason-code surface only

- The `StatusTransitionDialog` posts the existing transition request with `rejectionReasonCode`. The web change is **only** which options are offered: `allowedRejectionCodesFrom(currentStatus)` from `@properfy/shared` (`SCHEDULED → [INSPECTOR_NO_SHOW]`, `DONE → [NOT_EXECUTED]`), still honouring the F03 `SYSTEM_ONLY_REJECTION_CODES` filter.
- A `422 REJECTION_CODE_NOT_ALLOWED` from the server is surfaced in the dialog without closing it.
