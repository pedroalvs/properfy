# Phase 0 Research: Portal property issue

All decisions below are derived from the closed F10 decisions (D1–D29, 2026-10-30 / 2026-11-07) and verified against the merged F10-1 code (`ebf1b8e7`). No `NEEDS CLARIFICATION` remained.

## D-R1 · Reuse vs. new use cases

**Decision**: Add portal-specific use cases in `rental-tenant-portal/application`; do **not** call the F10-1 `property-file` use cases.

**Rationale**: The F10-1 `Presign`/`Confirm`/`CreatePropertyIssue` use cases require a JWT `AuthContext`: they `assertRoles(['AM','OP','CL_ADMIN','INSP'])`, resolve tenant by role, bind idempotency to `actor.userId`, and stamp `uploadedByUserId = actor.userId`. The portal has no `AuthContext` (token only). The portal use cases reuse the lower-level, actor-agnostic pieces: the repository ports (`IPropertyFileRepository`, `IPropertyIssueRepository`), `IStorageService`, `IPlatformSettingsReader`, `IIdempotencyService`, `AuditService`, `runInTransaction`, the `isDetectedMimeCompatible` domain helper, and the shared storage-key grammar.

**Alternatives considered**: (a) Extend the F10-1 use cases with a TNT/portal branch — rejected: couples the property-file module to portal semantics and edits merged, tested code (constitution V, minimal impact). (b) Extract a shared "upload validator" domain service used by both — rejected for this task: a larger refactor of merged code, out of the 1-task-1-PR scope; can be revisited if a third consumer appears.

## D-R2 · Token → scope resolution

**Decision**: Resolve `{ propertyId, tenantId }` from the token's `appointmentId` via `IPropertyIssueRepository.findAppointmentScope(appointmentId)`. Use that `tenantId` for every write and read; never trust any client-supplied id.

**Rationale**: `findAppointmentScope` already exists (F10-1) and returns exactly `{ propertyId: string | null, tenantId }`. The token middleware pins `appointmentId`, so this is the single scope source. Cross-token isolation is structural.

**Edge case**: `propertyId` can be `null` (an appointment without a property). Since `property_issues.property_id` is NOT NULL, the create-issue use case rejects with a clear error when `propertyId` is null (FR-008).

## D-R3 · Rate limiting (D21)

**Decision**: On the presign route, set `config.rateLimit = { max: 12, timeWindow: '1 hour', keyGenerator }`, where `keyGenerator` returns the hashed token (`container.tokenService.hashToken(params.token)`) with `request.ip` fallback for a missing token. Confirm, create-issue, and list keep the generic portal `{ max: 30, timeWindow: '1 minute' }` (per IP).

**Rationale**: `@fastify/rate-limit` is registered globally (200/min/IP); a route's `config.rateLimit` overrides it for that route (single bucket). The established codebase pattern (Live Day alert-thresholds `inspector.routes.ts:638`, inspector-notice push `:87`) is exactly "per-route `keyGenerator` keyed on a verified identity with IP fallback". Keying on the **hashed** token (not the raw token) avoids holding raw tokens in the limiter's memory and matches how the token is stored in the DB. 12/hour ≥ 5 photos with margin for a failed-photo re-send; the per-IP 30/min remains on the other three portal issue routes. Params are available at the `onRequest` hook (Fastify parses route params before onRequest), so no custom hook ordering is needed.

**Alternatives considered**: A second `@fastify/rate-limit` registration or a custom Postgres token-bucket to stack both limits on one route — rejected as over-engineering for this task; the single per-route override with IP fallback is the shipped convention and is testable.

## D-R4 · Audit actor

**Decision**: Audit `property_issue.created` with `actorType: 'ANONYMOUS'`, no actor id, `tenantId` = resolved tenant, `after = { source, appointmentId, photoCount }`. For confirmed photos, the portal confirm use case may also audit `property_file.uploaded` (ANONYMOUS) to mirror F10-1's C.A4 trail.

**Rationale**: `AuditService.actorType` is `'USER' | 'SYSTEM' | 'ANONYMOUS'`. The existing portal confirm/unavailable use cases audit with `actorType: 'ANONYMOUS'`. No coordinate/personal data is added (constitution Audit rule).

## D-R5 · Portal read-back DTO (privacy)

**Decision**: Define a portal-specific issue DTO exposing only `{ id, reason, createdAt, photos: [{ id, fileName, mime, createdAt }] }`. Do **not** reuse `propertyIssueResponseSchema` (which exposes `createdByUserId`, `seenAt`, `seenByUserId`, `source`, `cantDoEventId`).

**Rationale**: The tenant must never learn who/whether staff reviewed the report (no response/status/notification, task scope). A dedicated minimal schema is the response-side barrier.

## D-R6 · No download route / no portal-activity log

**Decision**: The portal exposes exactly the 4 scoped routes; no file-download route, and no `RentalTenantPortalActivity` entry for issue submission.

**Rationale**: The task scope lists 4 routes and "no response/status/notification". A download route would widen the token's blast radius and is unnecessary (the read-back list shows metadata only). A portal-activity log entry is extra scope; the issue is already visible to staff via the F10-2 unseen-issue indicators and issue surfaces, plus the `property_issue.created` audit. If the client later wants the submission to appear in the agency's Portal Activity timeline, it goes to `estacionamento.md`, not this task.

## D-R7 · Photo upload orchestration (D12)

**Decision**: One photo at a time: presign → client PUTs to the signed URL → confirm. The client tracks per-photo progress/failure. The issue is submitted only with the ids of photos that reached `confirmed` (PENDING + `confirmed_at`). `linkPendingIssuePhotos` (requires `confirmed_at IS NOT NULL`, verified in the F10-1 repo) atomically flips them to READY under the new issue, or the whole submission is 409 + rollback (D20).

**Rationale**: Matches D12/D20 and reuses the exact F10-1 repository method that web/PWA use, so behaviour cannot drift.

## D-R8 · Confirm reuses `confirmUpload(..., setReady=false)`

**Decision**: The portal confirm sets `confirmed_at` and keeps the photo `PENDING` by calling `fileRepo.confirmUpload(id, sizeBytes, /*setReady*/ false, now)`, after `headObject` + size + magic-byte + storage-key-grammar checks.

**Rationale**: Verified in `prisma-property-file.repository.ts`: `confirmUpload` writes `confirmed_at: now` regardless of `setReady`, and `linkPendingIssuePhotos` filters `confirmed_at: { not: null }`. So the create-issue step can link portal photos exactly like inspector issue photos.

## D-R10 · Presign response omits `storageKey` (minimal exposure)

**Decision**: The portal presign returns `portalPresignIssuePhotoResponseSchema = { fileId, uploadUrl, expiresAt }` — a portal-specific schema that does **not** include `storageKey` (unlike the F10-1 `presignPropertyFileUploadResponseSchema`).

**Rationale**: The storage key embeds the agency's `tenantId` UUID (`files/{tenantId}/tenant-issues/...`). The anonymous token holder never otherwise sees the `tenantId`, and does not need the key — the client uploads to `uploadUrl` and later references the photo by `fileId`. Not returning the key keeps the token's information exposure to exactly what it needs. `portalIssuePhotoResponseSchema = { id, fileName, mime, status, createdAt }` is the single photo shape for both the confirm response (status `PENDING`) and the issue `photos[]` (status `READY`).

## D-R9 · Storage key ↔ row validation (D25)

**Decision**: On confirm, re-parse the stored `storageKey` with `parsePortalIssueStorageKey` and assert the embedded `tenantId`/`appointmentId` equal the token's resolved scope before accepting. Reject (not-found) otherwise.

**Rationale**: D25 requires the confirm to validate the key ↔ row binding through the grammar, not a fixed extension. This is a third isolation barrier on top of the row's own `tenantId`/`appointmentId`.
