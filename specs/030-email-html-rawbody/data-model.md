# Phase 1 Data Model: Raw-HTML Email + Image Library + Queue Hardening

Database: PostgreSQL (Supabase) via Prisma. `camelCase` in app, `snake_case` in DB. Migration strategy: **expand/contract** (add new tables/columns; no destructive change to `notification_templates`).

## Enum: EmailAssetStatus (new)

```
PENDING        # presigned, awaiting upload
UPLOADED       # object present, not yet content-verified
VERIFIED       # content sniff+decode passed → usable in the library
UPLOAD_FAILED  # missing/oversized/spoofed/non-image → not usable
```
Lives in `packages/shared/src/enums/notification.ts` and Prisma. (Mirrors the inspector-asset status idea but adds an explicit `VERIFIED` gate.)

## Table: email_assets (new) — physical asset

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid? | NULL = platform-level (for platform-default templates); else tenant scope |
| `placeholder_key` | varchar(64) | friendly key used in `{{image:key}}`; **unique per tenant scope** |
| `storage_key` | text unique | `tenants/{tenantId|platform}/library/{assetId}-{safeFilename}` |
| `public_url` | text | stable public URL (derived from bucket + key; stored for convenience/stability) |
| `original_filename` | varchar(255) | |
| `content_type` | varchar(50) | **server-verified** type (png/jpeg/webp/gif) |
| `size_bytes` | int | actual object size (≤ 5 MB) |
| `width` | int? | decoded |
| `height` | int? | decoded |
| `status` | EmailAssetStatus | usable only when `VERIFIED` |
| `ever_sent` | boolean default false | set true the first time the asset is resolved into a real send → **only selects the deletion-warning copy** (FR-026); does NOT block/defer deletion |
| `uploaded_by_user_id` | uuid | |
| `created_at` | timestamptz default now() | |

Indexes/constraints:
- `@@unique([tenant_id, placeholder_key])` — unambiguous `{{image:key}}` resolution per tenant.
- `@@index([tenant_id])`, `@@index([status])`.
- Partial-unique on `storage_key`.

Validation rules:
- `placeholder_key` matches `^[a-zA-Z0-9_-]{1,64}$`.
- Becomes usable only at `VERIFIED`; `PENDING`/`UPLOADED`/`UPLOAD_FAILED` never appear in the library list.
- **Deletion (FR-026, final rule)**: blocked while any binding references it; when unbound, deletion **physically purges** the stored object and **hard-deletes** the row (no `deleted_at` soft-delete / no retain-forever). `ever_sent` does not affect whether deletion happens — it only drives the UI warning copy. (`deleted_at` column dropped — the model has no logical-only delete.)

## Table: template_image_bindings (new) — logical usage

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `template_id` | uuid FK → notification_templates.id | |
| `asset_id` | uuid FK → email_assets.id | |
| `placeholder_key` | varchar(64) | snapshot of the key as used in this template |
| `alt_text` | varchar(255)? | per-use; defaults from asset key/filename |
| `width` | int? | per-use override; defaults to asset.width |
| `height` | int? | per-use override; defaults to asset.height |
| `created_at` | timestamptz default now() | |

Indexes/constraints:
- `@@unique([template_id, placeholder_key])` — one binding per placeholder per template.
- `@@index([asset_id])` — drives "where is this asset used" + safe-deletion check (FR-025/FR-026).
- FK `asset_id` is `RESTRICT` on delete (DB-level guard reinforcing the app-level in-use block).

Lifecycle:
- Bindings are **reconciled on template save**: parse `{{image:key}}` from the saved body, upsert a binding per distinct key (resolving key→asset in tenant scope), and remove bindings whose key no longer appears. Save is rejected earlier if any key is unknown/out-of-scope (FR-005a), so reconciliation always resolves.

## Existing: notification_templates (no schema change)

- `body_html` continues to hold the operator's raw HTML — now containing `{{image:key}}` placeholders (never literal `<img>`).
- `body_text` continues to exist but becomes **system-derived** (written by the upsert use case from html-to-text); operators don't author it.
- `variables_json` continues to hold Handlebars data variables only (image placeholders excluded by the resolver).
- Stable surrogate `id` (uuid PK) already exists → used as `template_image_bindings.template_id`.

## Existing: notifications (no schema change required)

- Terminal `FAILED` status already exists in `NotificationStatus`; `failure_reason`, `retry_count`, `next_retry_at` already present → reused for the consolidated queue policy. No new column needed for object-retention (the `ever_sent` flag lives on the asset and is set during send).

## Audit (extend, no schema change)

- `UpsertNotificationTemplateUseCase` audit gains `before`/`after` body content (FR-011) — uses existing `audit_logs` (`before`/`after` JSON columns already supported by `AuditService.log`).
- Asset upload-confirm and asset deletion emit audit rows (`EMAIL_ASSET_UPLOADED`, `EMAIL_ASSET_DELETED`) with tenant scope.

## Storage bucket (Supabase)

- New **public** bucket `email-assets` added to `provision-storage-buckets.ts` `BUCKETS_EXPECTED` (public, like `tenant-branding`), with a configured per-object size guard (5 MB) and allowed content types png/jpeg/webp/gif. Served Content-Type = verified type.

## Migration (expand/contract)

1. **Expand**: add `EmailAssetStatus` enum; create `email_assets`, `template_image_bindings`; provision the `email-assets` bucket. No change to `notification_templates`/`notifications`.
2. App rollout: new use cases + refactored upsert/send/worker; retire the `retry-poll` cron path in code.
3. **Contract**: none required (no columns removed). The front-end's implicit bifurcation is deleted in app code, not DB.
