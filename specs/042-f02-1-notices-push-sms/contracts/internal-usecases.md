# Internal Contracts — Inspector Notices (no HTTP route)

Exposed on the DI container for F03/F04/F08 and for the delivery/sweep/retention jobs.

## `PublishSystemInspectorNoticeUseCase`

```ts
export interface PublishSystemInspectorNoticeInput {
  type: SystemInspectorNoticeType;   // critical derived via SYSTEM_NOTICE_CRITICALITY (D1)
  inspectorIds: string[];            // filtered to ACTIVE & not deleted (inactive/unknown dropped silently)
  title: string;                     // 1–120 after trim. PUBLIC on lock screen (L-F02-07)
  body: string;                      // 1–2000 after trim. PUBLIC: no key/lockbox codes, passwords,
                                     //   or tenant name/phone (address + service code OK)
  dedupeKey: string;                 // 1–200; stable per event, e.g. `route-published:${dayPlanId}:${version}`
  targetPath?: string;               // allowlist INSPECTOR_NOTICE_TARGET_PATTERNS; default /profile/announcements/:id
  requestId?: string;
}
export interface PublishSystemInspectorNoticeOutput { noticeId: string | null; created: boolean }
```

- `critical` is **not** chosen by the caller — it comes from the type.
- `targetPath` outside the allowlist → `ValidationError VALIDATION_ERROR "targetPath is not allowed"` (caller bug), nothing written.
- Idempotent by `dedupeKey`: repeat or concurrent race (`P2002`/`23505`) → `{noticeId:<existing>, created:false}`, no new insert/audit/enqueue.
- All candidates filtered out → `{noticeId:null, created:false}`, `logger.info('inspector_notice.system_no_recipients')`.
- `created:true` only when this call wrote the notice; consumers that run their own side effects (e.g. F03 auditing the reminder) gate on `created === true` (L-F03-03).
- Invalid title/body (empty, >120, >2000) → `ValidationError` (caller bug).
- Container: `container.inspectorNotice.publishSystemInspectorNoticeUseCase`.
- Docblock must carry the L-F02-07 public-content rule.

## `HasRecentSystemInspectorNoticeUseCase` (L-F08-06)

```ts
export interface HasRecentSystemInspectorNoticeInput {
  dedupeKeyPrefix: string;           // 1–200; matched as a literal (% and _ escaped), e.g. `program-level:${inspectorId}:`
  since: Date;                       // inclusive: created_at >= since
}
export type HasRecentSystemInspectorNoticeOutput = boolean;
```

- True iff a **system** notice (non-null `dedupe_key`) exists with `dedupe_key LIKE '<escaped prefix>%' ESCAPE '\'` and `created_at >= since`. Counts archived notices (it measures the send, not the box). Manual notices (null `dedupe_key`) never count.
- Repo method: `existsSystemNoticeByDedupeKeyPrefixSince(prefix, since)` (`SELECT EXISTS`). No new index yet (low volume).
- Invalid prefix (`''` or > 200 chars) → `ValidationError` (caller bug).
- Container: `container.inspectorNotice.hasRecentSystemNoticeUseCase`.

## `IPushSender` (domain port)

```ts
export type PushSendOutcome =
  | { outcome: 'SENT' }
  | { outcome: 'GONE'; statusCode: 404 | 410 }
  | { outcome: 'REJECTED'; statusCode: 401 | 403 }   // VAPID invalid/rotated (L-F02-04)
  | { outcome: 'FAILED'; statusCode: number | null }
  | { outcome: 'DISABLED' };

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export interface InspectorNoticePushPayload {
  v: 1; noticeId: string; title: string; body: string; critical: boolean; url: string;
}
export interface IPushSender {
  isEnabled(): boolean;
  send(target: PushTarget, payload: InspectorNoticePushPayload,
       opts: { ttlSeconds: number; urgency: 'normal' | 'high' }): Promise<PushSendOutcome>;
}
```

- `WebPushSender` maps `web-push` results: `201`→SENT; `WebPushError` 404/410→GONE; 401/403→REJECTED; 400/413/429/5xx→FAILED(statusCode); network error (no statusCode)→FAILED(null). Calls `sendNotification({endpoint, keys}, JSON.stringify(payload), {TTL, urgency, vapidDetails:{subject, publicKey, privateKey}, timeout: 10000})`.
- `DisabledPushSender`: always `{outcome:'DISABLED'}`; `isEnabled() === false`.
- Container picks `WebPushSender` when all three VAPID vars exist, else `DisabledPushSender` (and `GetPushConfig` returns `null`).

## Jobs (pg-boss)

| Job | Trigger | Options | Handler |
|---|---|---|---|
| `inspector-notice.deliver` | enqueued on publish + by sweep | `{singletonKey: noticeId, retryLimit:3, retryBackoff:true, expireInMinutes: getInspectorNoticeDeliverExpireMinutes(recipientCount)}` | `DeliverInspectorNoticeUseCase` |
| `inspector-notice.delivery-sweep` | cron `*/5 * * * *` Sydney | – | `SweepUndeliveredInspectorNoticesUseCase` |
| `inspector-notice.auto-archive` | cron `45 3 * * *` Sydney | – | `AutoArchiveInspectorNoticesUseCase` |

## SMS fallback call (into existing pipeline)

```ts
createNotificationUseCase.execute({
  notificationId: getInspectorNoticeSmsNotificationId(noticeId, inspectorId), // UUIDv5, retry-safe
  tenantId: null,
  recipient: inspector.phone,         // E.164 AU
  channel: 'SMS',
  templateCode: 'INSPECTOR_NOTICE_SMS',
  payloadJson: { message: buildInspectorNoticeSmsMessage(title, body) }, // ≤ 300 chars
});
```

Only when `critical && no push SENT` (D2-a), with a phone, and under the daily cap (L-F02-01).

## New repository methods

- `IInspectorNoticeRepository`: create (notice + recipients in tx), archive (CAS `updateMany where archived_at IS NULL`), list/get/detail, list-my/get-my/mark-read/count-unread, `findDueForDelivery`, `findUndeliveredForSweep`, `markDeliveryStarted/Completed`, `markRecipientsProcessed`, `autoArchiveSystemOlderThan`, `existsSystemNoticeByDedupeKeyPrefixSince`, `findByDedupeKey`.
- `IPushSubscriptionRepository`: `upsert`, `revoke(endpoint, reason, tx)`, `revokeAllForInspector(tx, inspectorId, reason)`, `incrementFailure(endpoint) → newCount`, `resetFailure(endpoint)`, `recomputePushEnabled(tx, inspectorId)`, `findActiveByInspector`, `purgeRevokedBefore(date)`.
- `INotificationRepository` (existing, MODIFY): `countByTemplateChannelSince(tenantId: null, templateCode, channel, since)` — excludes `SKIPPED`/`SKIPPED_OPT_OUT`, like `countByTenantChannelSince`.
