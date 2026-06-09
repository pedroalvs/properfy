# Implementation Plan: Raw-HTML Email Body + Image Library + Notification Queue Hardening

**Branch**: `refactor/email` (spec dir `030-email-html-rawbody`) | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/030-email-html-rawbody/spec.md` (Crítico: APROVADA 0/0/0; human-approved)

## Summary

Three additive workstreams on the existing `notification` module:

1. **Raw-HTML authoring** — replace the web composer's implicit HTML auto-detection/bifurcation with an explicit raw-HTML editor; the operator's HTML is the body. Save **validates against an email allowlist and rejects** unsafe markup (never mutates); `bodyText` is **backend-derived** (html-to-text); preview **renders** sanitized HTML; send sanitizes as defense-in-depth. Variables stay Handlebars `{{var}}`.
2. **Image library** — a dedicated **public** `email-assets` bucket + `email_assets` / `template_image_bindings` tables; a presign→upload→confirm flow with **content-based** verification (magic-byte sniff + decode, 5 MB cap); a library modal in the editor that inserts friendly `{{image:key}}` placeholders (saved bodies contain **no literal `<img>`**); a resolver (distinct from Handlebars) turns placeholders into trusted-host `<img>` at preview/send; safe-explicit deletion with **object retention** for ever-sent assets.
3. **Queue hardening** — consolidate the two overlapping retry mechanisms (pg-boss native retry + app `RETRY_DELAYS`/`retry-poll` cron) into one policy keyed by `Notification.id` (singletonKey dedup), exact backoff schedule, 5-min visibility, terminal `FAILED` surfaced on the Notification.

Technical approach grounds every piece in existing patterns: `TemplateRendererService` (Handlebars), `ResendEmailProvider`, `IStorageService` + `supabase-storage.service` + the inspector-asset presign/confirm flow, the public `tenant-branding` bucket precedent, `provision-storage-buckets.ts`, and the web `Dialog`/`FileUploadStep`/`TemplateFormDrawer` components.

## Technical Context

**Language/Version**: TypeScript 5.x strict, ES2022 ESM. Node.js 20 (backend); React 18 + Vite 5 + Tailwind 3 (web).
**Primary Dependencies**: Fastify 4, Prisma 5, Zod, Handlebars (existing renderer), Resend SDK, pg-boss, `@aws-sdk/client-s3` + `s3-request-presigner` (existing storage). New: `sanitize-html` (allowlist sanitizer), `html-to-text` (text derivation), `file-type` (magic-byte sniff) + `image-size` (decode dimensions). See research.md for choices.
**Storage**: PostgreSQL (Supabase) via Prisma — new tables `email_assets`, `template_image_bindings`; extended `notification_templates` usage (body_html becomes the operator's raw HTML / placeholder-bearing source). New **public** Supabase Storage bucket `email-assets`.
**Testing**: Vitest (unit), Supertest (API integration, real DB via Testcontainers), Playwright (web E2E). TDD red→green→refactor.
**Target Platform**: Linux server (Fly.io) backend; modern browsers (web).
**Project Type**: web (pnpm monorepo: `apps/backend`, `apps/web`, `packages/shared`).
**Performance Goals**: Email send is async (queue); image upload is direct-to-storage (no proxy through API). Preview render is a debounced backend call rendered in a sandboxed iframe.
**Constraints**: Shared environment (shared DB + Resend) — test-send guarded by a recipient allowlist. Email images served via stable public URL (no auth). Per-image cap 5 MB.
**Scale/Scope**: ~20 notification template codes × 2 channels per tenant; image assets per tenant (modest). Queue volume = existing notification volume.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| **I. Clean Architecture (NON-NEGOTIABLE)** | PASS | All new logic lands in the `notification` module across `domain/` (EmailImageAsset entity, TemplateImageBinding, `IEmailAssetStorage` port, `ImagePlaceholderResolver`, `HtmlSanitizerService` port, `HtmlToTextService` port, `ImageContentVerifier` port), `application/` (presign/confirm/list/delete/reconcile-bindings + the refactored upsert/send use cases), `infrastructure/` (Prisma repos, Supabase public-bucket adapter, sanitize-html/html-to-text/file-type adapters), `interfaces/` (Fastify routes). Dependencies point inward; adapters implement ports. |
| **II. Multi-Tenant Safety (NON-NEGOTIABLE)** | PASS | `email_assets.tenant_id` (nullable for platform-level, mirroring template scope); bindings inherit template scope; repos scoped by tenant; AM/OP cross-tenant via validated `tenantId` input; CL_ADMIN pinned. Asset deletion + upload produce audit records. |
| **III. TDD (NON-NEGOTIABLE)** | PASS | Each use case + the sanitizer/resolver/verifier services get unit tests first; routes get Supertest integration against real DB; web flows get Playwright. Critical (notifications) → 80%+ coverage. |
| **IV. Contract-First APIs (NON-NEGOTIABLE)** | PASS | New Zod schemas in `packages/shared/src/schemas/` (email-assets, image-binding, updated template upsert) consumed by backend routes + web client; new `/v1` endpoints; OpenAPI regenerated; error envelope + pagination + `request_id` preserved. |
| **V. Simplicity & Minimal Impact** | PASS | Reuse `IStorageService` (extend with public-URL builder), the presign/confirm pattern, the public-bucket precedent, `Dialog`/`FileUploadStep`. No new broker, no feature flags. Retire (delete) the duplicated retry-poll path rather than shim it. |

**No violations** → Complexity Tracking table omitted.

One design point worth flagging (not a violation): the email allowlist is applied with **two stage-specific profiles** — a *save* profile that forbids literal `<img>` entirely, and a *render* profile that permits trusted-host `<img>`. This is intentional (governance) and is modelled as one `HtmlSanitizerService` with two named configs, not two sanitizers.

## Project Structure

### Documentation (this feature)

```text
specs/030-email-html-rawbody/
├── plan.md              # This file
├── research.md          # Phase 0 — technology + approach decisions
├── data-model.md        # Phase 1 — entities, tables, migrations
├── quickstart.md        # Phase 1 — local validation incl. real Resend test-send
├── contracts/           # Phase 1 — endpoint + Zod contracts
│   └── email-and-images.md
└── tasks.md             # Phase 2 — /speckit.tasks (NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/notification.ts            # extend: upsert template (no implicit split), email-asset, image-binding schemas
├── constants/notification-templates.ts# unchanged variable catalog; add image-placeholder regex/spec
└── enums/notification.ts              # add EmailAssetStatus (PENDING|UPLOADED|VERIFIED|UPLOAD_FAILED)

apps/backend/src/modules/notification/
├── domain/
│   ├── email-image-asset.entity.ts            # NEW
│   ├── template-image-binding.entity.ts       # NEW
│   ├── image-placeholder-resolver.service.ts  # NEW ({{image:key}} → <img>, distinct from Handlebars)
│   ├── html-sanitizer.service.ts              # NEW port (save-profile / render-profile)
│   ├── html-to-text.service.ts                # NEW port
│   ├── image-content-verifier.ts              # NEW port (magic-byte + decode)
│   ├── email-asset.repository.ts              # NEW port
│   ├── template-image-binding.repository.ts   # NEW port
│   ├── email-asset-storage.service.ts         # NEW port (public bucket put/confirm/url/delete)
│   └── template-renderer.service.ts           # existing Handlebars renderer (unchanged engine)
├── application/use-cases/
│   ├── upsert-notification-template.use-case.ts  # REFACTOR: allowlist reject, no implicit split, derive bodyText, validate {{image:key}}, reconcile bindings, audit before/after body
│   ├── send-notification.use-case.ts             # REFACTOR: resolve images → sanitize(render) → derive text → send; mark asset ever-sent
│   ├── request-image-upload.use-case.ts          # NEW (presign)
│   ├── confirm-image-upload.use-case.ts          # NEW (content verify + activate)
│   ├── list-email-assets.use-case.ts             # NEW
│   ├── delete-email-asset.use-case.ts            # NEW (block if bound; retain object if ever-sent)
│   └── render-template-preview.use-case.ts       # NEW (sample render + resolve + sanitize → safe HTML for iframe)
├── infrastructure/
│   ├── prisma-email-asset.repository.ts          # NEW
│   ├── prisma-template-image-binding.repository.ts # NEW
│   ├── supabase-email-asset-storage.service.ts   # NEW (public bucket; getPublicUrl like branding)
│   ├── sanitize-html.service.ts                  # NEW (sanitize-html adapter, two profiles)
│   ├── html-to-text.service.ts                   # NEW (html-to-text adapter)
│   ├── image-content-verifier.ts                 # NEW (file-type + image-size adapter)
│   └── resend-email.provider.ts                  # existing (unchanged)
├── interfaces/
│   └── notification.routes.ts                    # extend: image endpoints + preview endpoint + updated template upsert
└── infrastructure/queue consolidation:
    apps/backend/src/shared/infrastructure/queue.ts  # REFACTOR: singletonKey support, expireIn, retire double-retry
    apps/backend/src/modules/notification/.../notification.worker(s)  # single retry policy; retire retry-poll cron

apps/backend/prisma/
├── schema.prisma                       # add EmailAsset, TemplateImageBinding models + EmailAssetStatus enum
├── migrations/                         # expand/contract migration
└── provision-storage-buckets.ts        # add public 'email-assets' bucket

apps/web/src/features/notification-templates/
├── components/
│   ├── TemplateFormDrawer.tsx          # REFACTOR: explicit raw-HTML editor; remove implicit bifurcation
│   ├── TemplatePreview.tsx             # REFACTOR: sandboxed iframe rendering backend preview HTML
│   ├── VariableInsertToolbar.tsx       # keep; add "Images" action
│   └── ImageLibraryModal.tsx           # NEW (Dialog + upload/list/select/insert/edit-alt/delete)
└── hooks/
    ├── useTemplateSave.ts              # REFACTOR: send raw HTML; surface allowlist/placeholder errors
    ├── useTemplatePreview.ts           # NEW (debounced backend preview)
    └── useEmailAssets.ts               # NEW (list/presign/upload/confirm/delete)
```

**Structure Decision**: Monorepo web app. The image library lives **inside the `notification` module** (not a standalone module) because assets and bindings are cohesive with notification templates and share tenant scope, audit, and the send pipeline — consistent with Clean Architecture cohesion and Simplicity.

## Phases

- **Phase 0 (research.md)** — resolve library choices (sanitizer, html-to-text, image sniff/decode), the preview-fidelity approach (backend render + sandboxed iframe), the queue-consolidation mechanism, and the served-Content-Type-spoofing closure. DONE (see research.md).
- **Phase 1 (data-model.md, contracts/, quickstart.md)** — entities/migrations, endpoint + Zod contracts, and local validation incl. a real guarded Resend test-send. DONE.
- **Phase 2 (/speckit.tasks)** — dependency-ordered tasks. NOT produced here.

## Risks & accepted trade-offs (incl. Planejador debate round 1)

- **Tenant scope (Q1, debate r2)**: endpoints conform to the **approved constitution §II** — cross-tenant AM/OP resolve `tenantId` from validated request input (nullable=platform default); CL_ADMIN pinned. The refactored upsert adopts this, fixing the pre-existing `OP→actor.tenantId` divergence. RBAC matrix (which roles manage templates) unchanged. Assets scoped to the template's resolved tenant. See contracts "Tenant-scope resolution".
- **bodyHtml round-trip (Q2)**: GET returns raw `bodyHtml`; editor loads it on reopen (was loading `bodyText`) — required for SC-005. Tasks T016a/T020.
- **Binding metadata (Q3, debate r2)**: BOTH the save payload AND the preview request carry draft `imageBindings[]` so modal-set alt/dims survive the first save *and* appear in the pre-save preview (FR-022/SC-020). Tasks T017/T021 (preview), T033/T033a (save).
- **Queue cutover (Q4)**: explicit — unschedule persisted cron, drain `next_retry_at` backlog once (singletonKey-safe), route manual retry + create-path through the single enqueue, `retryLimit:0` to kill double-retry. Deploy order documented (research R9a). Tasks T046–T048a.
- **Image deletion = usage-gated + informed consent (final rule, supersedes retention)** — in-use → blocked (UI lists templates); unbound → **real purge** after a mandatory confirmation modal (FR-026a). `ever_sent` only selects the modal warning copy. **Accepted trade-off**: purging an asset used in already-sent emails may break those historical emails; the modal warns the operator. No retain-forever path; storage does not grow unboundedly.
- **Scope size** — delivered as independent checkpoints/PRs: (1) US1 MVP, (2) US2+US3 images+delivery, (3) US5 queue (independent track). Reflected in tasks dependencies.

## Complexity Tracking

No constitution violations; table intentionally omitted.
