# Phase 1 Data Model — TASK-F06-2

No database schema change (FR-022). This documents the in-process shapes the triggers add. Existing F06-1/F04-2 types (`EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop`, `TenantEtaStopMeta`, `FreshDayPlanStop`, `TenantEtaNoticesSetting`, `CreateNotificationInput/Output`) are reused unchanged.

## Notifier input — `TenantEtaNotifyInput`

The caller (morning / evaluate / sweep via `evaluateForPlan`) loads `appointmentWithRelations`, `tenant`, `settings` and the `ProjectedStop`+`EtaPlanStop` pair, then calls the notifier.

```ts
type TenantEtaKind = 'MORNING' | 'ON_THE_WAY' | 'DELAY';           // F06-1 constant
type TenantEtaTrigger = 'MORNING' | 'FINISH' | 'CANT_DO' | 'LATE_NOTICE' | 'SWEEP' | 'EARLY_CHANGE';

interface TenantEtaNotifyInput {
  kind: TenantEtaKind;
  trigger: TenantEtaTrigger;
  planStop: EtaPlanStop;                 // identity + serviceStartAt + scheduledDate + tenantId + windowTimezone
  projected: ProjectedStop;              // projectedStartAt/projectedArrivalAt + window + lateS
  stopMeta: TenantEtaStopMeta;           // rentalTenantConfirmationStatus, keyRequired, requiresRentalTenantConfirmation
  band: EtaBand;                         // computeEtaBand(projectedStartAt, projected, now)
  appointmentWithRelations: AppointmentWithRelations;   // contact, serviceTypeFlowType, propertyAddress, …
  tenant: TenantEntity;                  // settingsJson: enabled flags + notificationDailyCapSms
  settings: TenantEtaNoticesSetting;     // enabled, channelMode, morningHour, smsBudgetSharePercent, …
  planVersion: number;                   // fresh read (payload + log)
  approximate: boolean;                  // plan snapshot (payload + log)
  now: Date;
}

interface TenantEtaNotifyResult { created: number; duplicates: number; skippedReason?: string; }
```

**Guard order** (first failure wins; `tenant_eta.notice_skipped { reason }`):
1. `settings.enabled` false → `DISABLED`.
2. agency-local hour of `now` (in `planStop.windowTimezone`) `< settings.morningHour` → `BEFORE_MORNING_HOUR`.
3. `!isTenantEtaNoticesEnabled(tenant.settingsJson)` → `AGENCY_ETA_OFF`.
4. `!isRentalTenantNotificationsEnabled(tenant.settingsJson)` → `AGENCY_SWITCH_OFF`.
5. `suppressesOccupantNotifications(appointment.serviceTypeFlowType)` → `FLOW_TYPE_NO_OCCUPANT`.
6. confirmation (stopMeta): `UNAVAILABLE` → `TENANT_UNAVAILABLE`; `PENDING`/`NO_RESPONSE` ∧ `keyRequired` ∧ `requiresRentalTenantConfirmation` → `TENANT_UNCONFIRMED`.
7. `kind==='ON_THE_WAY'` ∧ `projected.projectedArrivalAt − now > 60 min` → `NEXT_TOO_FAR`.
8. recipients (D1 + channelMode) empty → `NO_RECIPIENT`.
9. SMS budget (only if an SMS leg exists): `count ≥ limit` → drop SMS leg (`SMS_BUDGET_RESERVED`, log `sms_budget_reserved`); `SMS_ELSE_EMAIL` falls back to email.
10. per surviving channel: build payload → `createNotification` → `created?` → `notice_created` + metric, else `notice_skipped { ALREADY_SENT }`.

**Recipient rule.** EMAIL → `contact.effectiveEmail` (raw; repo fix handles casing). SMS → `toE164Au(contact.effectivePhone) ?? contact.effectivePhone` (D-R2).

## Job payload — `tenant-eta.evaluate`

```ts
interface EvaluateTenantEtaJob {
  trigger: 'FINISH' | 'CANT_DO' | 'LATE_NOTICE';
  appointmentId: string;
  tenantId: string;
  attempt: number;                 // 1..3 (STALE re-enqueue)
  inspectorId?: string;            // CANT_DO: metadata.initiatedByInspectorId
  occurredAt?: string;             // FINISH/CANT_DO: event envelope occurredAt ISO
  eventId?: string;                // LATE_NOTICE
}
```

Singleton keys (dedupe duplicate enqueues): `tenant-eta:FINISH:{appointmentId}:{occurredAtEpochMs}`, `tenant-eta:CANT_DO:{appointmentId}:{occurredAtEpochMs}`, `tenant-eta:LATE_NOTICE:{eventId}`. Options `{ retryLimit: 2, retryBackoff: true, expireInMinutes: 5 }`; STALE re-enqueue uses `startAfter = now + 30 s`, `attempt + 1`.

## Morning runner input — `DueTenantGroup`

`{ timezone, todayCivil, tenantIds }` from `TenantCronTick.runDue('tenant-eta.morning', settings.morningHour, runner, now)`; the runner computes `cutoff = zonedWallTimeToUtc(todayCivil, HH(morningCutoffHour)+':00', timezone)` and aborts the whole group if `now ≥ cutoff` (and re-checks before each create).

## Port — `ITenantEtaNoticeLog`

```ts
interface ITenantEtaNoticeLog {
  // L-F06-05: latest TENANT_ETA_MORNING band per appointment today (any channel), payload_json->>'etaBandFromAt'
  findMorningBands(appointmentIds: string[], sinceByAppointment: Map<string, Date>): Promise<Map<string, Date>>;
  // L-F06-11: cross-tenant count of TENANT_ETA_* SMS rows since `since` (platform volume metric; no route)
  countSmsCreatedSince(since: Date): Promise<number>;
}
```
Prisma adapter reads the `notifications` table; `countSmsCreatedSince` is cross-tenant **by design** (D9 exception, no route exposes it).

## Payload keys added to each `TENANT_ETA_*` row (`Record<string,string>`)

| Key | Value | Source |
|---|---|---|
| `etaFrom` / `etaTo` | `'h:mm am'` | `formatEtaBand(band, windowTimezone)` (template variables) |
| `etaBandFromAt` | `band.from.toISOString()` | L-F06-05 (not a variable) |
| `serviceStartAt` | `planStop.serviceStartAt?.toISOString()` | L-F04-15 (not a variable) |
| `planVersion` | `String(fresh.planVersion)` | L-F04-15 (not a variable) |
| `approximate` | `String(plan.approximate)` | L-F04-15 / D17 (not a variable) |

## Metrics — `MetricsCollector` additions

`tenantEtaNoticeCounts: Map<string, number>` keyed `'{kind}|{channel}'`; `incrementTenantEtaNoticeCount(kind, channel)`; cleared in `reset()`; surfaced under `getSnapshot().notification.tenantEtaNoticeCounts` (mirrors `smsPartsByTemplate`).

## Logs (structured; no phone/email)

`tenant_eta.notice_created { kind, trigger, appointmentId, tenantId, channel, bandFrom, bandTo, projectedStartAt, lateMinutes, approximate, planVersion }`; `tenant_eta.notice_skipped { kind, trigger, appointmentId, reason, channel? }` (reasons in `contracts/`); `tenant_eta.sms_budget_reserved { tenantId, count, cap, limit }`; `tenant_eta.morning_completed`/`morning_skipped_after_cutoff`; `tenant_eta.evaluate_completed`/`evaluate_gave_up`; `tenant_eta.sweep_completed { plans, evaluated, delayed, earlyChanged, created, skippedStale, smsCreatedToday, durationMs }`; `tenant_eta.daily_volume_high { smsCreatedToday, threshold }` (warn); `tenant_eta.enqueue_failed`; `tenant_eta.enqueue_skipped { reason: 'NO_INSPECTOR' | 'MANUAL_DONE' }`.

## Consent fix (no new type)

`PrismaNotificationConsentRepository` adds a private `normalizeConsentRecipient(recipient, channel)` = `channel==='EMAIL' ? recipient.trim().toLowerCase() : recipient`, applied in `findByScope`, `upsert` (findFirst `where` + stored `recipient`), `listByRecipient`. `RecordConsentOptOutUseCase.normalizeRecipient` lowercases email to match. No entity/schema change.
