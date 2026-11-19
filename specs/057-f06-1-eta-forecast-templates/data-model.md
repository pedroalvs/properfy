# Phase 1 Data Model — F06-1

No database schema changes (FR-024). These are the in-memory / contract types introduced or extended.

## Shared prediction types (`packages/shared/src/route-planning/project-stop-eta.ts`)

```ts
export interface EtaPlanStop {
  appointmentId: string;
  sequence: number;
  tenantId: string;
  scheduledDate: string;            // civil date, agency wall-clock (YYYY-MM-DD)
  appointmentStatus: string;        // 'SCHEDULED' | 'DONE' | other (others dropped)
  travelS: number;                  // day_plan_stops.travel_s (arriving leg)
  durationMinutes: number;
  windowStartAt: Date; windowEndAt: Date; windowTimezone: string;
  missingCoordinates: boolean;
  serviceStartAt: Date | null;      // fresh plan start
  serviceEndAt: Date | null;
  publishedServiceStartAt: Date | null; // frozen at publication (F04); null from PWA adapter
}
export interface EtaPlanInput {
  dayPlanId: string; planVersion: number; planDate: string; timezone: string;
  hasOrigin: boolean;               // origin_source <> 'NONE'
  departureAt: Date | null; approximate: boolean;
  stops: EtaPlanStop[];
}
export interface EtaRealEvents {
  executions: Map<string, { startedAt: Date | null; finishedAt: Date | null }>; // abandoned => both null
  lateNotices: Map<string, { minutesLate: number; createdAt: Date; clientOccurredAt: Date | null }>; // latest of day
}
export interface ProjectedStop {
  appointmentId: string;
  state: 'DONE' | 'IN_PROGRESS' | 'PENDING';
  windowStartAt: Date; windowEndAt: Date; windowTimezone: string;
  projectedArrivalAt: Date | null; projectedStartAt: Date | null; projectedEndAt: Date | null;
  lateS: number;                    // max(0, start − windowEndS)
  floorApplied: boolean;
}
```

Rules: classify (DONE / IN_PROGRESS / PENDING); order executed-by-sequence then pending-by-sequence; anchor from last executed; evaluate pending via `evaluateSequence` with `legTravelS = travelS`, `earliestDepartureS = max(anchorEnd ?? now, now)`; `LATE_NOTICE` floor per D18; `lateS` strict. Pure, deterministic, epoch-second arithmetic (DST-safe).

## Backend domain types (`apps/backend/src/modules/tenant-eta/domain/`)

- `TENANT_ETA_TEMPLATE_CODES = { MORNING, ON_THE_WAY, DELAY } as const`; `type TenantEtaKind = 'MORNING' | 'ON_THE_WAY' | 'DELAY'`.
- `computeEtaBand(startAt, { windowStartAt, windowEndAt }, now): { from: Date; to: Date }`; `formatEtaBand(band, tz): { from: string; to: string }`; `wallTimeHHmm(instant, tz): string` (`Intl en-GB`, `hourCycle 'h23'`); `roundToFiveMinutes`, `ceilToFiveMinutes`.
- `getTenantEtaNotificationId({ kind, appointmentId, scheduledDate, channel }): string` — UUID v5, fixed namespace `4f0b7d2e-9c3a-5e61-8b4d-27a1c6e95f03`.
- Port `ITenantEtaPlanReader`:
  - `loadPlan(dayPlanId): Promise<{ plan: EtaPlanInput; events: EtaRealEvents; stopMeta: Map<string, StopMeta> } | null>`
  - `findPlanByInspectorDate(inspectorId, planDate): Promise<{ dayPlanId; appointmentIds: string[] } | null>`
  - `listSweepCandidates(now): Promise<Array<{ dayPlanId; inspectorId; planDate }>>`
- `StopMeta = { rentalTenantConfirmationStatus: 'PENDING'|'CONFIRMED'|'UNAVAILABLE'|'NO_RESPONSE'; keyRequired: boolean; requiresRentalTenantConfirmation: boolean }` (L-F06-02; outside `EtaPlanInput`).

## Extended existing types

- `NotificationPayloadContext.eta?: { from: string; to: string }` → emits `etaFrom`/`etaTo` (key absent when no `eta`).
- `CreateNotificationOutput = { notificationId: string; created: boolean }` (was `{ notificationId }`).
- `MetricsCollector`: `smsPartsByTemplate: Map<string, number>` in `getSnapshot()`, reset in `reset()`; `addSmsParts(templateCode, parts)`.
- `tenantSettingsSchema.tenantEtaNoticesEnabled: z.boolean().default(true)`.
- `IInspectorFieldEventRepository.findLatestLateNoticeByAppointmentIds(ids: string[], since: Date): Promise<Array<{ appointmentId; minutesLate; createdAt; clientOccurredAt }>>`.

## Platform setting `tenantEtaNotices`

```ts
schema: z.object({
  enabled: z.boolean(),
  channelMode: z.enum(['BOTH', 'SMS_ELSE_EMAIL']),
  morningHour: z.number().int().min(5).max(11),
  morningCutoffHour: z.number().int().min(6).max(12),
  delayThresholdMinutes: z.number().int().min(5).max(120),
  smsBudgetSharePercent: z.number().int().min(10).max(100),
}).refine(v => v.morningCutoffHour > v.morningHour, {
  path: ['morningCutoffHour'], message: 'Cutoff must be after the morning notice hour' }),
defaults: { enabled: false, channelMode: 'BOTH', morningHour: 7, morningCutoffHour: 9, delayThresholdMinutes: 20, smsBudgetSharePercent: 80 },
section: 'Tenant arrival notices',
```

Shared constants (`constants/tenant-eta.ts`): `TENANT_ETA_BAND_HALF_WIDTH_MINUTES = 30`, `TENANT_ETA_ON_THE_WAY_MAX_LEAD_MINUTES = 60`, `TENANT_ETA_EARLY_CHANGE_MINUTES = 30`, `TENANT_ETA_DAILY_SMS_WARN_THRESHOLD = 500`.
