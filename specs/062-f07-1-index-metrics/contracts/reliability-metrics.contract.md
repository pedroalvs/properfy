# Contract: Reliability Metrics Engine (TASK-F07-1)

This slice exposes **no HTTP endpoint**. Its contract is the exported TypeScript surface consumed by TASK-F07-2 (snapshot/job/API) and F08 (goals), plus one new error on the existing status-transition route.

## Exported TypeScript contracts

```ts
// apps/backend/src/modules/reliability/application/reliability-metrics.service.ts
export interface InspectorReliabilityComputation {
  inspectorId: string;
  volume: number;            // universe size, excluding lateRejection facts
  completedCount: number;    // current-DONE occurrences (VOLUME numerator)
  metrics: ReliabilityMetricResult[]; // always the 8, in RELIABILITY_METRIC_KEYS order
}

export interface ReliabilityComputationBatch {
  volumeReference: {
    value: number;           // median (P11) or scaled override (L-F07-09); >= 1
    source: 'MEDIAN' | 'OVERRIDE';
    activeInspectors: number;
    periodDays: number;
  };
  byInspector: Map<string, InspectorReliabilityComputation>; // one entry per inspector with a service
}

export class ReliabilityMetricsService {
  computeMetric(metric: ReliabilityMetricKey, inspectorId: string, from: CivilDate, to: CivilDate): Promise<ReliabilityMetricResult>;
  computeAll(from: CivilDate, to: CivilDate, inspectorIds?: string[]): Promise<ReliabilityComputationBatch>;
  computeAllWith(tx: Prisma.TransactionClient, from: CivilDate, to: CivilDate, settings: ReliabilitySettingsInput): Promise<ReliabilityComputationBatch>;
}

// apps/backend/src/modules/reliability/domain/volume-reference.ts
export function computeVolumeReference(
  completedCounts: number[], override: number | null, periodDays: number,
): { value: number; source: 'MEDIAN' | 'OVERRIDE'; activeInspectors: number; periodDays: number };

// apps/backend/src/modules/reliability/domain/volume-prorata.ts  (L-F07-05)
export function activeDaysInPeriod(inspectorCreatedOn: CivilDate, from: CivilDate, to: CivilDate): number;

// apps/backend/src/modules/reliability/domain/score.ts
export function computeReliabilityScore(
  metrics: ReliabilityMetricResult[], settings: ReliabilityIndexSetting, volume: number,
): { status: ReliabilityScoreStatus; score: number | null };

// packages/shared/src/enums/reason-codes.ts  (L-F07-01, L-F07-04)
export function allowedRejectionCodesFrom(fromStatus: AppointmentStatus): RejectionReasonCode[];
```

- `CivilDate = string` (`YYYY-MM-DD`).
- `ReliabilitySettingsInput = { reliabilityIndex: ReliabilityIndexSetting; toleranceMinutes: number }`.
- Behavioral guarantees: reader runs a fixed query count; `computeMetric` of a non-VOLUME metric never calls `loadCompletedCounts`; the volume reference is computed once per call; `from > to` / invalid date → `RangeError`; results never carry coordinates.

### Contract notes for F07-2 / F08 (L-F07-08)

- The **service date** of a fact is P2 of this feature (not just `finished_at`): `finished_at` (EXECUTED), `scheduled_date` (DONE_WITHOUT_EXECUTION / NO_SHOW_REJECTED), field-event `created_at` (CANT_ATTEND), rejection date for a late `NOT_EXECUTED`.
- `snapshotDate` (F07-2) may be earlier than today when the job fell behind; consumers must not assume "today".
- There is no `getUncached`; settings are read through `IPlatformSettingsReader` (30 s cache).

## HTTP contract delta (existing status-transition route)

- `POST /v1/appointments/:id/status` (existing) now accepts `rejectionReasonCode ∈ { INSPECTOR_NO_SHOW, NOT_EXECUTED }` subject to the per-origin guard.
- **New error** (422):

```json
{ "error": {
    "code": "REJECTION_CODE_NOT_ALLOWED",
    "message": "This rejection reason can't be used from the current status",
    "details": { "fromStatus": "SCHEDULED", "rejectionReasonCode": "NOT_EXECUTED" }
} }
```

- The `appointment.status_transition` audit for a REJECTED transition now carries `metadata.rejectionReasonCode` (absent when no code is sent).
- No new route schema is added; `pnpm generate:api` is re-run and any `api-types.ts` diff (only if the setting schema is OpenAPI-typed) is committed with `openapi.json`.
