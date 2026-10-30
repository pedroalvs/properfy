# Data Model — Inspector notices Web (045)

This feature creates **no database entities**. It consumes the F02-1 contract and shared
Zod types already on `develop`. The "model" here is the set of view models the web reads and
the publish payload it sends, all defined in `packages/shared/src/schemas/inspector-notice.ts`
and `constants/inspector-notices.ts`.

## Consumed shared types (source of truth)

| Type | Shape (relevant fields) | Used by |
|---|---|---|
| `PublishInspectorNoticeInput` | `{ title, body, critical (default false), audience }` | New notice drawer → `POST` body |
| `InspectorNoticeAudienceInput` | `ALL` \| `SELECTED{inspectorIds[1..500], deduped}` \| `REGION{regionId}` | Audience radios |
| `InspectorNoticeSummary` | `{ id, title, body, critical, audience, author{type,name}, publishedAt, archivedAt, recipientCount, readCount }` | List rows |
| `InspectorNoticeAudience` (returned) | adds `REGION{regionName}` snapshot and `SYSTEM{systemType}` | List/detail audience label |
| `InspectorNoticeDetail` | summary **+** `recipients[]: { inspectorId, inspectorName, readAt, inspectorStatus: 'ACTIVE'\|'INACTIVE', hasAppAccess }` | Detail page |
| `ListInspectorNoticesQuery` | `pagination + status: 'active'\|'archived'\|'all'` (default `active`) | List query |
| constants | `INSPECTOR_NOTICE_TITLE_MAX=120`, `BODY_MAX=2000`, `SELECTED_MAX=500` | Counters & validation |
| `buildInspectorNoticeSmsMessage(title, body)` | → SMS preview string (not shown in this UI; backend owns delivery) | n/a (web shows ceiling only) |

## Web-local view models

- **Audience label** (`lib/format-audience.ts`): maps `InspectorNoticeAudience` →
  `"All active inspectors"` (ALL) / `"N selected inspectors"` (SELECTED, from
  `inspectorIds.length`) / `"Region: {regionName}"` (REGION) / `"Automatic"` (SYSTEM).

- **Critical ConfirmDialog copy** (`lib/critical-confirm-copy.ts`): pure function of
  `{ critical, audienceSize: number | null, now: Date }` →
  - base: `"Notices can't be edited or deleted after publishing. You can archive them later."`
  - critical: + `"Critical notices are sent by push, or by SMS to inspectors without push."`
  - critical + `audienceSize != null`: + `"Up to {N} inspector(s) may receive an SMS."`
  - critical + `audienceSize == null`: + `"Inspectors without push may receive an SMS."`
  - critical + Sydney hour ∈ `[21, 7)`: + `"It's {h:mm a} in Sydney. Inspectors will be notified now."`
  The Sydney hour and `{h:mm a}` are derived from `now` via the shared display-timezone
  helper, independent of the browser timezone.

- **Read tally** (detail): `readCount` / `recipientCount` → `"Read by X of Y"`; when
  `Z = count(recipients where readAt == null AND (inspectorStatus=='INACTIVE' OR hasAppAccess==false)) > 0`
  → `"Read by X of Y (Z can't read in the app)"`. Progress bar `aria-valuenow=X`,
  `aria-valuemax=Y`.

## State transitions (UI-level)

A notice has exactly two lifecycle states this UI acts on:

```text
(published) ──Archive──▶ (archived)
```

- There is **no** draft/edit/delete transition (D4): once published, only archive.
- Archive is idempotent: archiving an already-archived notice returns 200 and the UI reflects
  the archived state.

## Option-source models (for the drawer)

| Source | Endpoint | Fields used |
|---|---|---|
| Active inspectors (multi-select) | `GET /v1/inspectors?status=ACTIVE&pageSize=100` (all pages) | `id`, `name`, `email` |
| Active inspector count (ALL ceiling) | `GET /v1/inspectors?status=ACTIVE&pageSize=1` | `pagination.total` |
| Active regions | `GET /v1/service-regions?status=ACTIVE&pageSize=100` | `id`, `name`, `inspectorCount` |
