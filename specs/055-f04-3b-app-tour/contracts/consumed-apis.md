# Consumed APIs (read-only — no contract change)

This feature introduces **no new endpoint and no schema change**. It consumes two existing endpoints exactly as shipped by F01-3 and TASK-F04-2. `api-types.ts` is NOT regenerated.

## 1. `GET /v1/inspectors/me` (read)

- **Owner**: F01-3 (no OpenAPI response schema; PWA types it manually in `useInspectorMe`).
- **Consumed field**: `onboardingCompletedAt: string | null` (added by TASK-F04-2). Used by the controller to decide whether to auto-open the tour.
- **Change here**: extend the manual type in `features/profile/hooks/useInspectorMe.ts` to include `onboardingCompletedAt`. No wire/contract change.

## 2. `POST /v1/inspectors/me/app-state` (write)

- **Owner**: F01-1/F01-3 (app-state heartbeat). Schema `inspectorAppStateSchema` (strip mode): `{ displayMode, pushPermission, appVersion }`, plus `onboardingCompleted: z.literal(true).optional()` (added by TASK-F04-2, server `COALESCE`). Returns 204, rate-limited 10/min.
- **Use here**: on first-access finish/skip, POST the three standard fields **plus** `onboardingCompleted: true`, once, bypassing the 6h heartbeat throttle. Replay sends nothing.
- **Risk note**: if the server dropped `onboardingCompleted` from its schema (strip mode), the key would be silently discarded and the tour would reopen forever. Covered by E2E E4 against the mock and a one-time staging check (T11).

## 3. `GET /v1/inspector/day-plans/:date` (read — E2E only concern)

- **Owner**: F04-2/F04-3 (the Today screen reads it). Not changed here.
- **Relevance**: every tour E2E lands on `/today`, which reads this endpoint, so its default stub is added to the shared E2E baseline (see research D10). No production code change.
