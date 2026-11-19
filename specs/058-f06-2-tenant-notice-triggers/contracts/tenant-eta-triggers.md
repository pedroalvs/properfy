# Contracts — TASK-F06-2 (jobs, events, logs)

**No HTTP route, no OpenAPI/`api-types.ts` change.** The opt-out route + `tenantEtaNoticesEnabled` shipped in F06-1. These are the internal contracts F06-2 adds/consumes.

## Jobs (pg-boss)

| Job | Schedule | Options | Handler |
|---|---|---|---|
| `tenant-eta.morning` | `'0 * * * *'` (PLATFORM_TIMEZONE) | default | read setting → `enabled` early-return → `tenantCronTick.runDue('tenant-eta.morning', morningHour, runner)` → `SendMorningEtaNoticesUseCase.execute(group)` |
| `tenant-eta.evaluate` | on-demand (`boss.work`) | enqueued with `{ retryLimit: 2, retryBackoff: true, expireInMinutes: 5 }` + singletonKey | `EvaluateTenantEtaUseCase.execute(job.data)` |
| `tenant-eta.sweep-delays` | `'*/30 * * * *'` (Sydney) | `boss.work(..., { teamSize: 1, teamConcurrency: 1 })` | read setting → `enabled` early-return → `SweepTenantEtaDelaysUseCase.execute(now)` |

`EvaluateTenantEtaJob` payload + singleton keys: see `data-model.md`.

## Domain events consumed

| Event (name) | Filter | Enqueues |
|---|---|---|
| `appointment.status_transition.v1` | `toStatus==='DONE'` ∧ `metadata.source==='INSPECTOR_FINISH'` | `tenant-eta.evaluate { trigger:'FINISH', appointmentId, tenantId, occurredAt: event.occurredAt.toISOString(), attempt:1 }` |
| `appointment.status_transition.v1` | `toStatus==='REJECTED'` ∧ `metadata.source==='INSPECTOR_CANT_DO'` | `tenant-eta.evaluate { trigger:'CANT_DO', appointmentId, tenantId, inspectorId: metadata.initiatedByInspectorId, occurredAt, attempt:1 }` |
| `inspector_field_event.recorded.v1` | `payload.type==='LATE_NOTICE'` | `tenant-eta.evaluate { trigger:'LATE_NOTICE', appointmentId, tenantId, eventId, attempt:1 }` |

DONE without `metadata.source` → no enqueue, `tenant_eta.enqueue_skipped { reason:'MANUAL_DONE' }`. CANT_DO without `initiatedByInspectorId` → `enqueue_skipped { reason:'NO_INSPECTOR' }`. REJECTED with any other origin → nothing. Subscribers never rethrow (log `tenant_eta.enqueue_failed`).

## Event producer change

`FinishInspectionUseCase` passes `auditMetadata: { source: 'INSPECTOR_FINISH' }` to `executeInTransaction`, surfacing `metadata.source === 'INSPECTOR_FINISH'` on the emitted `→ DONE` transition. Constant `TRANSITION_SOURCE_INSPECTOR_FINISH = 'INSPECTOR_FINISH'` exported beside F03's `INSPECTOR_CANT_DO`.

## `notice_skipped` reasons (closed set)

`DISABLED`, `BEFORE_MORNING_HOUR`, `AFTER_CUTOFF`, `AGENCY_ETA_OFF`, `AGENCY_SWITCH_OFF`, `FLOW_TYPE_NO_OCCUPANT`, `TENANT_UNAVAILABLE`, `TENANT_UNCONFIRMED`, `NEXT_TOO_FAR`, `NO_RECIPIENT`, `SMS_BUDGET_RESERVED`, `ALREADY_SENT`, `NO_PLAN`, `PLAN_STALE`, `STARTED`, `WINDOW_PASSED`, `NEXT_STARTED`, `NO_NEXT_STOP`, `INSPECTOR_BUSY`, `NOT_TODAY`, `NEXT_DAY`.

## Notification rows produced

Each `TENANT_ETA_*` row is created via `CreateNotificationUseCase` with `{ notificationId: getTenantEtaNotificationId({kind, appointmentId, scheduledDate, channel}), tenantId: <appointment's own>, appointmentId, recipient, channel, templateCode: TENANT_ETA_TEMPLATE_CODES[kind], payloadJson }`. `created:false` ⇒ already existed ⇒ no job, no metric, `notice_skipped { ALREADY_SENT }`.

## Dedupe & one-per-day invariant (01.A7)

At most one row per `(kind, appointmentId, scheduledDate, channel)` (deterministic id + `saveIfAbsent`). At most one `DELAY` per `(appointmentId, agency-local day, channel)` (deterministic id for the day). At most one `ON_THE_WAY` per `(appointmentId, day, channel)` across FINISH/CANT_DO/EARLY_CHANGE (same id). Day boundary = agency-local midnight.
