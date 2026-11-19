# Contract — Shared Predictor, Templates & Config (frozen for F05 / F06-2)

## Prediction module (`packages/shared/src/route-planning/project-stop-eta.ts`)

```ts
export function projectStopEta(plan: EtaPlanInput, events: EtaRealEvents, now: Date): ProjectedStop[];
export function isProjectedLate(stop: ProjectedStop, thresholdMinutes: number): boolean;
export function etaPlanInputFromDayPlanResponse(plan: DayPlanResponse): EtaPlanInput;
```

Frozen names: `EtaPlanInput`, `EtaPlanStop`, `EtaRealEvents`, `ProjectedStop` (no `EtaPlanSnapshot`). Departure rule `max(anchorEnd ?? now, now)`. Consumers must not reimplement prediction; backend consumers (F05) build `EtaPlanInput` with `publishedServiceStartAt` from the DB, PWA uses the adapter (`publishedServiceStartAt = null`). With no `LATE_NOTICE` the pending starts equal F04's recompute / the inspector app (E12).

## Templates

Codes `TENANT_ETA_MORNING`, `TENANT_ETA_ON_THE_WAY`, `TENANT_ETA_DELAY` in `MANDATORY_TEMPLATE_CODES`, each EMAIL + SMS, target `RENTAL_TENANT`, class `OPERATIONAL`, never protected, never `_SMS`-suffixed. New variables `etaFrom`/`etaTo` (`'h:mm am'`, GSM-7), `required` on all three. `NotificationPayloadContext.eta?: { from; to }`. `UpsertNotificationTemplateUseCase` rejects a template missing a `required` var (400 `Missing required variables: …`, `field 'bodyHtml'`).

Labels: `'Arrival Estimate – Morning'`, `'Inspector On The Way'`, `'Inspector Running Late'`.

## Config & flag

- `PLATFORM_SETTINGS_REGISTRY.tenantEtaNotices` (see data-model.md) — defaults off, `section 'Tenant arrival notices'`.
- `tenantSettingsSchema.tenantEtaNoticesEnabled: boolean (default true)`; `isTenantEtaNoticesEnabled(settings)` (absent = on).
- Shared constants in `constants/tenant-eta.ts`.

## Plumbing

- `CreateNotificationOutput = { notificationId; created }` (`created:false` = id already existed, no job enqueued).
- `MetricsCollector.addSmsParts(templateCode, parts)` → `getSnapshot().smsPartsByTemplate`.
- `ITenantEtaPlanReader` (`loadPlan`/`findPlanByInspectorDate`/`listSweepCandidates`) + `stopMeta`.
- `IInspectorFieldEventRepository.findLatestLateNoticeByAppointmentIds(ids, since)`.
- Log `notification.sms_dispatched { notificationId, tenantId, templateCode, parts, encoding, length, truncated }` (no recipient).
