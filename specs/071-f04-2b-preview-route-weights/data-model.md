# Phase 1 Data Model — F04-2b Preview route weights

**No new persistent entity, table, column, enum or migration.** The feature is read-only orchestration. This file documents the read model and the response shape (all shared types already merged in F04-2).

## Read inputs (existing ports)

- `IDayPlanInputReader.loadInspectorContext(inspectorId)` → `InspectorDayPlanContext | null` (identity, effective tz, `baseLat/baseLng`). The preview reads no day-plan row, so the origin is the base (`baseLat` set → `BASE`) else `NONE`; no saved override is involved. `null` → `404 INSPECTOR_NOT_FOUND`.
- `IDayPlanInputReader.loadCandidates(inspectorId, planDate, todayCivil)` → `DayPlanCandidate[]` (SCHEDULED T-1-visible + DONE). Each candidate supplies `appointmentCode`, `suburb`, `timeSlotStart/End` (wall strings), `tenantTimezone`, `windowStartAt/windowEndAt` (instants), `durationMinutes`, `lat/lng`, `startedAt/finishedAt/abandonedAt`.
- `IPlatformSettingsReader.get('routeWeights')` → `RouteWeights` (saved platform weights = `current`).

## Transient compute model (no persistence)

For each weight set (`current`, `proposed`), over the **reorderable** candidates (non-executed via `classifyStops`) sharing one matrix:

| Field | Source |
|---|---|
| `order: string[]` | `optimizeRoute(optimizerInput).order` |
| per-stop `sequence, arrivalS, lateS, travelS, waitS` | `evaluateSequence(optimizerInput, order).stops[i]` |
| `departureS, finishS, totalTravelS, totalWaitS, totalLateS, feasible` | `evaluateSequence(...)` |
| `approximate` | matrix outcome (stub/fallback → true) |

## Response (shared `routeWeightsPreviewResponseSchema`, unchanged)

```
{ current: RouteWeightsPreview, proposed: RouteWeightsPreview }
```

`RouteWeightsPreview` (`routeWeightsPreviewSchema`):

| Field | Mapped from |
|---|---|
| `weights` | the weight set used (current = saved setting, proposed = request) |
| `etaSource` | literal `'MATRIX'` |
| `approximate` | matrix outcome |
| `departureAt` | `departureS` → ISO instant (nullable) |
| `finishEta` | `finishS` → ISO instant (nullable) |
| `totals.driveS` | `totalTravelS` |
| `totals.waitS` | `totalWaitS` |
| `totals.lateS` | `totalLateS` |
| `feasible` | `feasible` |
| `stops[].appointmentId / sequence` | evaluation stop |
| `stops[].appointmentCode / suburb` | candidate |
| `stops[].windowStart / windowEnd` | candidate `timeSlotStart / timeSlotEnd` |
| `stops[].timezone` | candidate `tenantTimezone` (the stop's agency tz) |
| `stops[].eta` | evaluation `arrivalS` → ISO instant (non-null) |
| `stops[].lateS` | evaluation `lateS` |

## Validation

- Body: `previewRouteWeightsRequestSchema` (`inspectorId` uuid, `date` civil, `weights` = `routeWeightsSettingSchema` — 0..10 step 0.1, at least one > 0). Fails → `400 VALIDATION_ERROR` (before routing).
- Date range: today..today+14 in `actor.timezone ?? PLATFORM_TIMEZONE`; out of range → `422 DAY_PLAN_PREVIEW_DATE_OUT_OF_RANGE` (before routing).
- RBAC: AM/OP only; else `403 FORBIDDEN`.
