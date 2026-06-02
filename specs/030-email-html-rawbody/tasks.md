# Tasks: Raw-HTML Email Body + Image Library + Notification Queue Hardening

**Feature**: `030-email-html-rawbody` | **Branch**: `refactor/email` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

TDD is mandatory (constitution §III): each implementation task is preceded by its failing test(s). `[P]` = parallelizable (different files, no incomplete deps). Story labels map to spec user stories. Paths are repo-relative.

**MVP = Phase 1 + 2 + US1** (author raw HTML with variables, reject-on-save, rendered preview). US2/US3/US4/US5 are additive increments.

---

## Phase 1: Setup

- [X] T001 Add backend deps in `apps/backend/package.json`: `sanitize-html`, `html-to-text`, `file-type`, `image-size` (+ `@types/sanitize-html`, `@types/html-to-text`); run `pnpm install`.
- [X] T002 [P] Add `EmailAssetStatus` enum (`PENDING|UPLOADED|VERIFIED|UPLOAD_FAILED`) to `packages/shared/src/enums/notification.ts` and export it.
- [X] T003 [P] Add `IMAGE_PLACEHOLDER_REGEX` and an `imagePlaceholderKey` validator to `packages/shared/src/constants/notification-templates.ts`.
- [X] T004 Add public `email-assets` bucket (5 MB, png/jpeg/webp/gif) to `apps/backend/prisma/provision-storage-buckets.ts` (`BUCKETS_EXPECTED`, public like `tenant-branding`).
- [X] T005 Add env config keys in `apps/backend/src/main/env*`: `EMAIL_ASSETS_BUCKET`, `EMAIL_ASSETS_PUBLIC_URL_BASE`, `EMAIL_TEST_RECIPIENT_ALLOWLIST`.

## Phase 2: Foundational (blocking prerequisites)

- [X] T006 Prisma: add `EmailAsset`, `TemplateImageBinding` models + `EmailAssetStatus` enum to `apps/backend/prisma/schema.prisma` per data-model.md (incl. `@@unique([tenant_id, placeholder_key])`, `@@unique([template_id, placeholder_key])`, FK `asset_id` onDelete RESTRICT, `ever_sent`). NOTE: the final deletion rule has **no soft-delete** → `deleted_at` is NOT part of the model. (The already-applied migration created `deleted_at`; drop it in T006b.)
- [X] T006b Contract migration to **drop `deleted_at`** from `email_assets` (the foundational migration shipped it before the final rule). `SPECIFY_FEATURE=030-email-html-rawbody pnpm --filter backend prisma migrate dev --name drop-email-asset-deleted-at`. Update `schema.prisma` to remove the column.
- [X] T007 Generate + apply expand migration: `SPECIFY_FEATURE=030-email-html-rawbody pnpm --filter backend prisma migrate dev --name email-assets-image-bindings`.
- [X] T008 [P] Shared Zod schemas in `packages/shared/src/schemas/notification.ts`: revise `upsertNotificationTemplateSchema` (remove `bodyText`, keep required `bodyHtml`, add optional `tenantId` and `imageBindings[]`); revise the template read DTO to include `bodyHtml` + bindings (Q2/Q3); add `emailAssetSchema`, `requestEmailAssetUploadSchema`, `confirmEmailAssetResponseSchema`, `templateImageBindingSchema`, `editBindingSchema`, `templatePreviewRequestSchema` (incl. optional `tenantId` + draft `imageBindings[]`), `templatePreviewResponseSchema`, `deleteEmailAssetSchema` (`{ confirm: z.literal(true) }` — server-enforced consent for FR-026a; rejected as `400 CONFIRMATION_REQUIRED` when absent/false).
- [X] T009 [P] Domain ports (interfaces only) in `apps/backend/src/modules/notification/domain/`: `html-sanitizer.service.ts` (save+render profiles), `html-to-text.service.ts`, `email-asset-storage.service.ts`, `image-content-verifier.ts`, `email-asset.repository.ts`, `template-image-binding.repository.ts`.
- [X] T010 [P] Unit test (red) for sanitizer profiles in `apps/backend/.../domain/__tests__/html-sanitizer.spec.ts`: save profile rejects `<script>/on*/javascript:`/any `<img>`; render profile permits asset-host `<img>`, drops non-host `<img>`.
- [X] T011 Implement `apps/backend/src/modules/notification/infrastructure/sanitize-html.service.ts` (sanitize-html adapter, two profiles + diff-based reject helper) → green T010.
- [X] T012 [P] Unit test (red) + impl `html-to-text.service.ts` in `infrastructure/` (images→alt, links preserved) — `__tests__/html-to-text.spec.ts`.
- [X] T013 Wire new ports/adapters into the DI container `apps/backend/src/main/container.ts` (sanitizer, html-to-text; asset deps added in US2).

**Checkpoint**: schemas/migration/ports ready; sanitizer + text-derivation usable by US1/US3.

---

## Phase 3: User Story 1 — Raw-HTML authoring with variables (P1) 🎯 MVP

**Goal**: operator writes raw HTML, inserts `{{var}}`, sees rendered preview, saves; unsafe/literal-`<img>`/unknown-placeholder bodies are rejected; stored body byte-identical.
**Independent test**: quickstart §A.

- [X] T014 [P] [US1] Integration test (red) for `PUT /v1/notification-templates/:code/:channel` in `apps/backend/.../interfaces/__tests__/upsert-template.int.spec.ts`: accepts raw HTML+`{{var}}`, rejects `<script>`/literal `<img>`/unknown `{{image:key}}` (422), round-trips body byte-identical, derives `bodyText`.
- [X] T015 [US1] Refactor `apps/backend/src/modules/notification/application/use-cases/upsert-notification-template.use-case.ts`: validate body via sanitizer **save profile** (reject, no mutate), parse `{{image:key}}` and reject unknown keys (in-scope), derive `bodyText` via html-to-text, store raw `bodyHtml`; keep existing protected-class logic. **Conform tenant resolution to constitution §II** — cross-tenant AM/OP resolve `tenantId` from validated request input (nullable=platform default); CL_ADMIN pinned (replaces the prior `OP→actor.tenantId` divergence; RBAC matrix unchanged). Record resolved `tenantId` on audit.
- [ ] T016 [US1] Update route + Zod binding in `apps/backend/.../interfaces/notification.routes.ts` (drop `bodyText` input; accept optional `tenantId` (AM) + resolve scope per contracts "Tenant-scope resolution"; map 422 details to error envelope) → green T014.
- [X] T016a [US1] Extend `GET /v1/notification-templates` list/detail to return raw **`bodyHtml`** (+ bindings on detail) in `notification.routes.ts` + list/detail use case + DTO (Q2 — required for SC-005 round-trip). Add integration assertion that GET returns the exact saved `bodyHtml`.
- [X] T017 [P] [US1] Unit test (red) + impl `render-template-preview.use-case.ts` (sample-data render + image-resolve + render-profile sanitize; accepts draft `imageBindings[]` + `tenantId` and applies draft alt/dims with fallback to persisted bindings→asset defaults so pre-save preview matches FR-022/SC-020; unknown var → labelled placeholder; render error → inline error, never throw) in `application/use-cases/` + `__tests__`.
- [X] T018 [US1] Add `POST /v1/notification-templates/:code/:channel/preview` route in `notification.routes.ts` (returns `{ subjectRendered, htmlRendered }`).
- [X] T019 [P] [US1] Web: refactor `apps/web/src/features/notification-templates/hooks/useTemplateSave.ts` — send raw `bodyHtml` verbatim; **delete** the HTML auto-detect/bifurcation; surface 422 reject details.
- [X] T020 [P] [US1] Web: refactor `apps/web/src/features/notification-templates/components/TemplateFormDrawer.tsx` — explicit raw-HTML editor; load **`bodyHtml`** (not `bodyText`) on open so reopen is byte-identical (Q2); keep `VariableInsertToolbar`. Update `hooks/useTemplateList.ts`/detail to read `bodyHtml`+bindings.
- [X] T021 [US1] Web: new `apps/web/src/features/notification-templates/hooks/useTemplatePreview.ts` (debounced call to preview endpoint; passes the current draft `imageBindings[]` + active `tenantId` so pre-save alt/dims render in the preview — SC-020).
- [X] T022 [US1] Web: refactor `apps/web/src/features/notification-templates/components/TemplatePreview.tsx` to render preview HTML in a **sandboxed `<iframe srcdoc>`** (no `allow-scripts`).
- [ ] T023 [P] [US1] Playwright (red→green) `apps/web/.../e2e/template-raw-html.spec.ts`: type HTML+var → preview renders; save `<script>` → rejected; save/reopen byte-identical.

**Checkpoint**: MVP — raw-HTML authoring with safe rendered preview and reject-on-save works end-to-end (no images, no send changes yet).

---

## Phase 4: User Story 2 — Image library (P1)

**Goal**: upload/browse/insert/reuse/delete images via a modal; `{{image:key}}` placeholders; content-verified, public-URL assets; safe-explicit deletion with object retention.
**Independent test**: quickstart §B.

- [X] T024 [P] [US2] Domain entities `email-image-asset.entity.ts`, `template-image-binding.entity.ts` + `image-placeholder-resolver.service.ts` (regex resolve `{{image:key}}`→`<img>`, distinct from Handlebars) in `apps/backend/.../domain/` (+ unit test for resolver `__tests__/image-placeholder-resolver.spec.ts`, red first).
- [X] T025 [P] [US2] Unit test (red) + impl `infrastructure/image-content-verifier.ts` (file-type magic-byte sniff == declared type, image-size decode dims, ≤5 MB, reject svg/non-image) — `__tests__/image-content-verifier.spec.ts`.
- [X] T026 [P] [US2] Impl `infrastructure/supabase-email-asset-storage.service.ts` (public bucket put/headObject/getPublicUrl like branding, delete) + `prisma-email-asset.repository.ts` + `prisma-template-image-binding.repository.ts` (tenant-scoped).
- [X] T027 [P] [US2] Integration test (red) `interfaces/__tests__/email-assets.int.spec.ts`: presign→confirm happy path; confirm rejects spoofed/svg/oversized; list returns only VERIFIED; placeholderKey uniqueness 409.
- [X] T028 [US2] Use cases in `application/use-cases/`: `request-image-upload.use-case.ts` (presign+PENDING+audit), `confirm-image-upload.use-case.ts` (verify→VERIFIED/UPLOAD_FAILED+audit), `list-email-assets.use-case.ts`.
- [X] T029 [US2] Use case `application/use-cases/edit-image-binding.use-case.ts` (alt/width/height) + usages query.
- [X] T030 [US2] Integration test (red) for delete semantics `interfaces/__tests__/delete-email-asset.int.spec.ts` (FINAL rule): missing/`false` `confirm`→`400 CONFIRMATION_REQUIRED` (no purge); in-use (even with confirm)→`409 ASSET_IN_USE`+usages; unbound+confirm (never-sent)→physical purge (object gone + row hard-deleted); unbound+confirm (ever-sent)→physical purge too, response `everSent:true`. **No** logical/retain branch.
- [X] T031 [US2] Use case `application/use-cases/delete-email-asset.use-case.ts`: **require `confirm: true`** (else `400 CONFIRMATION_REQUIRED` — server-enforced consent); block-if-bound (return usages) else **physically purge** object + hard-delete row + audit `EMAIL_ASSET_DELETED` (record `everSent`, tenant). `ever_sent` does NOT gate deletion (only informs the client warning). → green T030. (Depends on T006b — `deleted_at` dropped.)
- [X] T032 [US2] Routes in `notification.routes.ts`: `GET/POST /v1/email-assets`, `POST /v1/email-assets/:id/confirm`, `GET /v1/email-assets/:id/usages`, `PATCH /v1/email-assets/:id/bindings/:bindingId`, `DELETE /v1/email-assets/:id` (validate the body with `deleteEmailAssetSchema` → `400 CONFIRMATION_REQUIRED` if `confirm` is not `true`) → green T027/T030.
- [ ] T033 [US2] Binding reconciliation in `upsert-notification-template.use-case.ts`: accept optional `imageBindings[]` (placeholderKey + alt/width/height) in the save payload (Q3); on save, parse `{{image:key}}` → upsert/remove `template_image_bindings`, applying `imageBindings` metadata by key, defaulting from the asset when absent (so modal-set alt/dims survive first save).
- [X] T033a [US2] Web: `ImageLibraryModal`/`TemplateFormDrawer` collect per-insert alt/dims into editor state and send them as `imageBindings[]` in the save payload (`useTemplateSave.ts`); rehydrate from detail bindings on reopen (Q3).
- [X] T034 [US2] Wire asset storage/verifier/repos into `container.ts`.
- [X] T035 [P] [US2] Web hook `apps/web/.../hooks/useEmailAssets.ts` (list/presign/PUT/confirm/delete/editBinding).
- [X] T036 [P] [US2] Web component `apps/web/.../components/ImageLibraryModal.tsx` (Dialog-based: list+thumbnails, upload dropzone reusing FileUploadStep, preview, select→insert `{{image:key}}`, edit alt/dims). **Delete UX (FR-026/FR-026a)**: if in-use, show a blocking message naming the templates that use it (no delete); if unbound, require the mandatory confirmation modal (title `Delete image?`, approved message; show the historical-email warning when `everSent`) before calling `DELETE`.
- [X] T037 [US2] Wire "Images" action into `VariableInsertToolbar.tsx`/`TemplateFormDrawer.tsx` (insert placeholder at cursor; reuse cursor logic).
- [ ] T038 [P] [US2] Playwright `apps/web/.../e2e/image-library.spec.ts`: upload PNG→appears; reject svg; insert→placeholder+preview image; delete in-use→blocked with template list; delete unbound→confirmation modal shown (with historical-email warning when ever-sent) then real purge; cancel aborts.

**Checkpoint**: managed images end-to-end; preview renders real images; governance (no literal `<img>`, content-verified, safe deletion) enforced.

---

## Phase 5: User Story 3 — Safe, faithful delivery (P1)

**Goal**: send resolves images→renders→sanitizes(render)→derives text→sends html+text; test-send guarded.
**Independent test**: quickstart §D.

- [X] T039 [P] [US3] Integration test (red) `interfaces/__tests__/send-notification.int.spec.ts`: rendered email matches authored HTML w/ resolved vars; images resolve to asset-host `<img>`; both html+text parts present; spoof content neutralized; asset `ever_sent` set.
- [X] T040 [US3] Refactor `application/use-cases/send-notification.use-case.ts`: pipeline image-resolve → Handlebars render (recipient values) → sanitizer **render profile** → html-to-text → `ResendEmailProvider.send(html, text)`; mark resolved assets `ever_sent=true`.
- [X] T041 [P] [US3] Integration test (red) + guard impl for test-send recipient allowlist (`403 RECIPIENT_NOT_ALLOWED`) in `application/use-cases/send-test-notification.use-case.ts` + route.
- [X] T042 [US3] Ensure platform-default fallback + locale/timezone (tenant config → platform default) applied identically in preview (T017) and send (parity for SC-013).

**Checkpoint**: real emails render correctly with images + text part; test-send is safe in the shared env.

---

## Phase 6: User Story 4 — Auditable template changes (P2)

**Goal**: template create/update audits before/after body.
**Independent test**: quickstart (edit → inspect audit).

- [X] T043 [P] [US4] Integration test (red) `interfaces/__tests__/template-audit.int.spec.ts`: update captures prior+new body; create captures new with empty before.
- [X] T044 [US4] Extend audit call in `upsert-notification-template.use-case.ts` to include `before`/`after` body (load prior template before upsert) → green T043.

## Phase 7: User Story 5 — Robust, predictable delivery queue (P2)

**Goal**: one retry policy keyed by `Notification.id`; concrete schedule; 5-min visibility; terminal `FAILED`; retire double-retry.
**Independent test**: quickstart §C.

- [X] T045 [P] [US5] Unit test (red) for the retry policy in `apps/backend/src/modules/notification/domain/__tests__/retry-policy.spec.ts`: schedule `[15s,45s,2m,5m,15m]` ±10% jitter, max 6 → terminal FAILED.
- [X] T046 [US5] Add `singletonKey` + `expireInMinutes` passthrough to `apps/backend/src/shared/infrastructure/queue.ts` `sendJob`; set notification queue `retryLimit: 0` (disable pg-boss auto-retry).
- [ ] T047 [US5] Apply `singletonKey: notificationId` on **both** enqueue paths — notification **create** and the worker **self-reschedule** (Q4); worker enqueues with `expireInMinutes: 5`; on failure reschedule via `startAfter` using the schedule; on 6th failure set Notification terminal `FAILED` + `failure_reason`. File: `apps/backend/src/modules/notification/...worker` / `main/workers.ts`.
- [X] T047a [US5] Update `POST /v1/notifications/:id/retry` use case to re-enqueue through the single path (`sendJob` with `singletonKey: notificationId`) — never the old poll (Q4).
- [ ] T048 [US5] Cutover (Q4): on startup `boss.unschedule('notification.retry-poll')` (idempotent) and **delete** the cron registration + dead `RETRY_DELAYS`/poll code; add a one-time bootstrap that re-enqueues non-terminal notifications with due/pending `next_retry_at` via the new path (safe under `singletonKey`). Deploy order: unschedule → register new worker → bootstrap drain (research R9a).
- [X] T048a [US5] Integration test (red→green) `queue-cutover.int.spec.ts`: ghost cron is unscheduled; backlog `next_retry_at` rows are drained once (no duplicate send via singletonKey); manual retry re-drives via new path.
- [X] T049 [P] [US5] Integration test (red→green) `interfaces/__tests__/queue-policy.int.spec.ts`: duplicate enqueue→one send (singletonKey); exhausted retries→terminal FAILED visible in `GET /v1/notifications` + manual retry re-drives; stalled job reclaimed after visibility window.
- [X] T050 [US5] Write the queue assessment doc (FR-017) at `specs/030-email-html-rawbody/queue-assessment.md` (current vs target, what changed).

---

## Phase 8: Polish & Cross-Cutting

- [ ] T051 Regenerate OpenAPI from Fastify routes + regenerate the web API client; verify no drift (constitution §IV).
- [ ] T052 [P] Run quickstart.md end-to-end incl. a real guarded Resend test-send to the safe inbox (SC-002/003/015) and capture evidence.
- [ ] T053 [P] Verify coverage ≥80% for the notification module; fill gaps.
- [ ] T054 Final gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter backend prisma migrate diff` all green.

---

## Dependencies & Order

- **Setup (P1)** → **Foundational (P2)** block everything.
- **US1 (P3)** depends only on Foundational → **MVP**, independently shippable.
- **US2 (P4)** depends on Foundational (migration) + the resolver; US1's preview/send treat "no images" as a no-op so US1 ships without US2.
- **US3 (P5)** depends on Foundational sanitizer/text + (for images) US2's resolver; can send raw-HTML emails after US1 even before US2.
- **US4 (P6)** depends on US1's upsert use case (audit extension).
- **US5 (P7)** is independent of US1–US4 (queue layer) — can run in parallel with the authoring/image streams.
- **Polish (P8)** last.

## Parallel opportunities

- Foundational: T008/T009/T010/T012 in parallel (different files).
- US2: T024/T025/T026 (domain/infra) in parallel; web T035/T036 in parallel with backend once routes exist.
- US5 can be developed by a separate track concurrently with US1/US2/US3.

## MVP scope

Phase 1 + Phase 2 + **US1** = a working raw-HTML composer with safe rendered preview and reject-on-save. Demo-able before images/queue work.
