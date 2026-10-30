# Phase 1 Data Model — Inspector Notices

**Multi-tenant exception (D9, documented exception to Constitution §II / CLAUDE.md §7.1):** all three tables are platform-scoped and carry **no `tenant_id`**. Scope is by role (AM/OP) and by JWT `inspectorId` (INSP). Every INSP query filters `inspector_id = authContext.inspectorId`.

## Entity: InspectorNotice (`@@map("inspector_notices")`)

| Column | Prisma type | Null | Default | Index | Semantics |
|---|---|---|---|---|---|
| `id` | `String @id @default(uuid())` | no | uuid | PK | |
| `title` | `String @db.VarChar(120)` | no | – | – | 1–120 after trim |
| `body` | `String @db.Text` | no | – | – | 1–2000 after trim; plain text, newlines preserved |
| `critical` | `Boolean` | no | `false` | – | D1; for system notices derived from the type |
| `audience_json` | `Json` | no | – | – | `{type:'ALL'}` \| `{type:'SELECTED',inspectorIds}` \| `{type:'REGION',regionId,regionName}` \| `{type:'SYSTEM',systemType}` |
| `system_type` | `String? @db.VarChar(40)` | yes | – | – | one of `SYSTEM_INSPECTOR_NOTICE_TYPES`; null = manual |
| `dedupe_key` | `String? @db.VarChar(200)` | yes | – | `@unique` | idempotency of system notices; null on manual |
| `target_path` | `String? @db.VarChar(200)` | yes | – | – | D15; system only; validated by `isAllowedInspectorNoticeTargetPath`; null ⇒ `/profile/announcements/<id>` |
| `author_user_id` | `String?` | yes | – | – | FK `users.id` `onDelete: Restrict`; **null = system** |
| `published_at` | `DateTime` | no | `now()` | `@@index` | publication = creation (no draft/schedule) |
| `archived_at` | `DateTime?` | yes | – | `@@index` | D4 |
| `delivery_started_at` | `DateTime?` | yes | – | – (sweep filters by `published_at`) | first delivery-job run; null after 2 min ⇒ lost enqueue |
| `delivery_completed_at` | `DateTime?` | yes | – | – | job end (all processed, or archive stop); started ≥20 min ago & still null with pending ⇒ incomplete (L-F02-03) |
| `created_at` | `DateTime` | no | `now()` | – | |
| `updated_at` | `DateTime @updatedAt` | no | – | – | |

Relations: `author User? @relation("InspectorNoticeAuthor", fields:[author_user_id], references:[id])`; `recipients InspectorNoticeRecipient[]`. On `User`: `authored_inspector_notices InspectorNotice[] @relation("InspectorNoticeAuthor")`.

## Entity: InspectorNoticeRecipient (`@@map("inspector_notice_recipients")`)

Materialized at publish time.

| Column | Type | Null | Default | Index | Semantics |
|---|---|---|---|---|---|
| `notice_id` | `String` | no | – | PK part | FK `inspector_notices.id` `onDelete: Restrict` |
| `inspector_id` | `String` | no | – | PK part; `@@index([inspector_id, read_at])` | FK `inspectors.id` `onDelete: Restrict` |
| `read_at` | `DateTime?` | yes | – | (in index) | first open; never overwritten |
| `delivery_processed_at` | `DateTime?` | yes | – | – | delivery checkpoint (push/SMS decided); makes retry idempotent; not a receipt |
| `created_at` | `DateTime` | no | `now()` | – | |

`@@id([notice_id, inspector_id])`. On `Inspector`: `notice_recipients InspectorNoticeRecipient[]`.

## Entity: InspectorPushSubscription (`@@map("inspector_push_subscriptions")`)

Renamed from the plan's `PushSubscription` to avoid colliding with the DOM/`web-push` `PushSubscription` type.

| Column | Type | Null | Default | Index | Semantics |
|---|---|---|---|---|---|
| `id` | `String @id @default(uuid())` | no | uuid | PK | |
| `inspector_id` | `String` | no | – | `@@index([inspector_id, revoked_at])` | FK `inspectors.id` `onDelete: Cascade` |
| `endpoint` | `String @db.VarChar(2048)` | no | – | `@unique` | https push-service URL; identifies device/browser |
| `p256dh` | `String @db.VarChar(255)` | no | – | – | client public key (base64url) |
| `auth` | `String @db.VarChar(255)` | no | – | – | auth secret (base64url) |
| `revoked_at` | `DateTime?` | yes | – | (in index) | null = active |
| `revoked_reason` | `String? @db.VarChar(20)` | yes | – | – | `GONE`(404/410) \| `UNSUBSCRIBED` \| `REJECTED`(401/403) \| `FAILED`(5 consecutive) \| `DEACTIVATED` |
| `failure_count` | `Int` | no | `0` | – | consecutive `FAILED`; `SENT`/upsert reset; `>=5` ⇒ revoke |
| `created_at` | `DateTime` | no | `now()` | – | |
| `updated_at` | `DateTime @updatedAt` | no | – | – | |

## Modified column: `inspectors.push_enabled` (F01, redefined D10)

Becomes `EXISTS(SELECT 1 FROM inspector_push_subscriptions WHERE inspector_id = $1 AND revoked_at IS NULL)`, recomputed in the same tx as each subscription write (upsert, unsubscribe, revocation, deactivation). `NULL` still means "never reported/subscribed"; recompute writes `true`/`false`. Migration data step: `UPDATE "inspectors" SET "push_enabled" = FALSE WHERE "push_enabled" = TRUE;` (no one has a subscription yet).

## Validation rules (enforced in Zod / use cases)

- `title`: trim, 1–120. `body`: trim, 1–2000.
- `audience`: discriminated union; `SELECTED.inspectorIds` 1–500 UUIDs, deduped; `REGION.regionId` UUID.
- Recipients resolved to `status='ACTIVE' AND deleted_at IS NULL`; `ALL` includes those without `user_id`.
- `target_path` (system only): must pass `isAllowedInspectorNoticeTargetPath` else `ValidationError` (caller bug).
- `endpoint`: https, ≤ 2048; `keys.p256dh`/`keys.auth`: 1–255.

## State / lifecycle

- **Notice**: created (published) → optionally archived. Immutable except `archived_at`, `delivery_started_at`, `delivery_completed_at`. No edit/delete.
- **Recipient**: created at publish → `delivery_processed_at` set once during delivery → `read_at` set once on first inspector open.
- **Subscription**: active (`revoked_at` null) → revoked (one of 5 reasons); upsert of the same endpoint revives it (clears revocation, resets `failure_count`); purged by the retention job 90 days after revocation.

## Index rationale

- `inspector_notices(published_at)` — list ordering + sweep window scan.
- `inspector_notices(archived_at)` — active/archived filters + auto-archive scan.
- `inspector_notices(dedupe_key)` unique — system idempotency; many NULLs allowed.
- `inspector_notice_recipients(inspector_id, read_at)` — inspector box + unread count.
- `inspector_push_subscriptions(endpoint)` unique — device identity + upsert.
- `inspector_push_subscriptions(inspector_id, revoked_at)` — active-subscription existence check (`push_enabled`) and per-inspector revocation.
