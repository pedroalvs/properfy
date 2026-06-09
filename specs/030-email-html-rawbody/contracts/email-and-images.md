# Phase 1 Contracts: Email Templates + Image Library + Preview

REST `/v1`, camelCase payloads, Zod-validated at the boundary, error envelope `{ error: { code, message, details? } }`, `request_id` header required. Zod schemas live in `packages/shared/src/schemas/notification.ts` and are imported by backend routes + web client. OpenAPI regenerated from Fastify routes.

Auth: web authoring/test-send surface = **AM/OP** (unchanged); backend authorization AM/OP/CL_ADMIN (FR-010). All routes tenant-scoped (AM/OP via validated `tenantId`; CL_ADMIN pinned).

## Tenant-scope resolution (applies to every endpoint below)

Resolution follows the **approved constitution §II rule** for cross-tenant roles (this conforms the pre-existing `OP→actor.tenantId` divergence in the upsert path, which is being refactored anyway; the **RBAC matrix is unchanged** — the same roles manage templates):
- **AM / OP (cross-tenant)** → `tenantId` is taken from **validated request input** (`tenantId` body/query field), which may be `null` to address the **platform-default** scope. These roles may carry `tenant_id = null` in the JWT.
- **CL_ADMIN (pinned)** → `tenantId = actor.tenantId`; any request-supplied `tenantId` must equal it or is rejected.

Image assets and bindings are scoped to the **same resolved `tenantId` as the template** they serve, so `{{image:key}}` always resolves within one scope. `save`/`preview`/`test-send` and the asset endpoints all carry the same optional `tenantId` (cross-tenant roles) and resolve identically; the web (AM/OP) sends its active tenant context. The resolved `tenantId` is recorded on every audit row (constitution §II). Repositories apply the resolved scope automatically — never an unscoped query.

## Templates (modified)

### PUT /v1/notification-templates/{templateCode}/{channel}
Refactored: accepts the operator's **raw HTML** body; server validates (allowlist reject), derives `bodyText`, validates `{{image:key}}`, reconciles bindings, audits before/after.

Request (Zod `upsertNotificationTemplateSchema`, revised):
```
{
  subject?: string (1..255),
  bodyHtml: string (>=1),          // raw HTML, no literal <img>, {{image:key}} allowed
  isActive: boolean,
  notificationClass?: 'TRANSACTIONAL'|'OPERATIONAL'|'MARKETING',
  tenantId?: uuid,                 // AM/OP cross-tenant via validated request input (see Tenant-scope resolution)
  imageBindings?: [                // per-placeholder metadata captured in the modal, carried to first save (Q3)
    { placeholderKey: string, altText?: string(0..255), width?: int, height?: int }
  ]
  // bodyText REMOVED from input — now server-derived
}
```
Reconciliation: the server reconciles `template_image_bindings` from the `{{image:key}}` placeholders present in `bodyHtml`, applying `imageBindings[*]` metadata (alt/width/height) by `placeholderKey`, defaulting from the asset when absent. This is how alt/dims set at insertion survive to first save (a new template has no `template_id` until saved).
Responses:
- `200` → template DTO (incl. raw `bodyHtml`, server-derived `bodyText`, resolved `variables`, bindings).
- `422 VALIDATION` with `details` enumerating: disallowed tag/attribute/scheme, literal `<img>` present, or unknown `{{image:key}}` (FR-005a). Body NOT persisted.

### GET /v1/notification-templates  (modified — return raw source)
The list/detail response MUST include **`bodyHtml`** (the operator's raw source, with `{{image:key}}` placeholders), not only `bodyText`. The web editor loads `bodyHtml` on reopen so SC-005 (byte-identical round-trip) holds. Detail also returns the template's bindings (placeholderKey + alt/dims) so the editor can rehydrate per-use metadata.

### POST /v1/notification-templates/{templateCode}/{channel}/test-send
Now exercises validate→resolve-images→render→sanitize→derive-text→send. Body: `{ recipientEmail: string, tenantId?: uuid }` — **same tenant-scope resolution as save/preview/assets** (AM/OP cross-tenant via validated `tenantId`, nullable=platform default; CL_ADMIN pinned), so the template + its `{{image:key}}` assets resolve in one scope. **Recipient guard** (FR-012a): `recipientEmail` must be on the configured test allowlist else `403 RECIPIENT_NOT_ALLOWED`.

### POST /v1/notification-templates/{templateCode}/{channel}/preview  (NEW)
Backend-rendered safe preview for the editor (FR-003, SC-013).
Request:
```
{ bodyHtml: string,
  subject?: string,
  tenantId?: uuid,                 // cross-tenant roles; scopes {{image:key}} resolution
  imageBindings?: [                // DRAFT per-placeholder metadata from the modal (pre-first-save) — Q3/SC-020
    { placeholderKey: string, altText?: string, width?: int, height?: int }
  ]
}
```
Response `200`:
```
{ subjectRendered: string, htmlRendered: string }  // image-resolved + sample-vars + render-profile sanitized; safe for sandboxed iframe
```
Notes: the preview resolver applies `imageBindings` (draft alt/dims) when present, falling back to persisted bindings then asset defaults — so alt/dimensions set in the modal **before the first save** appear in the preview (FR-022/SC-020). Uses `SAMPLE_DATA`; unknown data variable → labelled placeholder; render error → `{ error }` field rendered inline (never 500 for a malformed draft).

## Image library (new)

### GET /v1/email-assets
List usable (`VERIFIED`) assets for the tenant scope (deleted assets are hard-removed, so they simply no longer appear).
Query: `tenantId?` (AM/OP), `page`, `pageSize`, `sortBy`, `sortOrder`.
Response: paginated list of asset DTO `{ id, placeholderKey, publicUrl, originalFilename, contentType, width, height, sizeBytes, createdAt }`.

### POST /v1/email-assets   (presign)
Request (`requestEmailAssetUploadSchema`):
```
{ placeholderKey: string ^[a-zA-Z0-9_-]{1,64}$,
  declaredContentType: 'image/png'|'image/jpeg'|'image/webp'|'image/gif',
  declaredSizeBytes: int (1..5_242_880),
  originalFilename: string (1..255),
  tenantId?: uuid }              // AM/OP cross-tenant
```
Server: assert role, reject duplicate `placeholderKey` in scope, reject declared type/size out of policy, create `PENDING` row, issue signed PUT URL (TTL 900 s).
Response `201`: `{ assetId, uploadUrl, storageKey, expiresAt }`.
Errors: `409 PLACEHOLDER_KEY_TAKEN`, `422 VALIDATION` (type/size).

### POST /v1/email-assets/{assetId}/confirm
Server: HEAD the object, **content-verify** (magic-byte sniff == declared type, decode width/height, size ≤ 5 MB); on pass → `VERIFIED` (usable) + audit; on fail → `UPLOAD_FAILED`, discard object.
Response `200`: `{ assetId, status: 'VERIFIED'|'UPLOAD_FAILED', width?, height?, sizeBytes?, publicUrl? }`.
Errors: `422 IMAGE_VERIFICATION_FAILED` (with reason: not-an-image / type-mismatch / oversized / svg-blocked).

### PATCH /v1/email-assets/{assetId}/bindings/{bindingId}   (edit per-use metadata)
Edit `altText`/`width`/`height` for a usage (FR-022).
Request: `{ altText?: string(0..255), width?: int, height?: int }`. Response `200`: binding DTO.

### GET /v1/email-assets/{assetId}/usages
Returns templates/placeholders referencing the asset (drives safe-deletion UI, FR-025).
Response: `{ usages: [{ templateId, templateCode, channel, placeholderKey }] }`.

### DELETE /v1/email-assets/{assetId}
Usage-gated deletion with informed consent enforced **at the system boundary** (FR-026 / FR-026a — final rule).
Request body: `{ confirm: true }` (required).
- If `confirm !== true` → `400 CONFIRMATION_REQUIRED` (the purge is irreversible and may break historical emails, so the backend refuses an unconfirmed delete — consent is not merely a client modal).
- If any binding references it → `409 ASSET_IN_USE` with `details.usages` (the template list). Not deleted. (The UI uses this to tell the operator which templates to clean up first; never silent.)
- Else (unbound, confirmed) → **physically purge** the stored object and hard-delete the row. `200 { deleted: 'physical', everSent: boolean }`. The `everSent` flag lets the client know which warning copy applies. No `ever_sent`-based retention/logical-delete branch.
Audit `EMAIL_ASSET_DELETED` (records `everSent`, tenant scope). The UI still presents the mandatory confirmation modal (FR-026a) before sending `confirm: true`; the backend flag makes the consent inescapable even outside the UI.

## Shared schema additions (`packages/shared`)
- `upsertNotificationTemplateSchema` — remove `bodyText`; keep `bodyHtml` required; add doc that image placeholders use `{{image:key}}`.
- `requestEmailAssetUploadSchema`, `confirmEmailAssetResponseSchema`, `emailAssetSchema`, `templateImageBindingSchema`, `editBindingSchema`, `templatePreviewRequest/ResponseSchema`.
- `EmailAssetStatus` enum; `IMAGE_PLACEHOLDER_REGEX` constant.

## Error codes (new)
`RECIPIENT_NOT_ALLOWED`, `PLACEHOLDER_KEY_TAKEN`, `IMAGE_VERIFICATION_FAILED`, `ASSET_IN_USE`, `CONFIRMATION_REQUIRED`, plus existing `VALIDATION`.
