# Phase 0 Research: Raw-HTML Email + Image Library + Queue Hardening

All decisions are grounded in the existing codebase and the constitution (Clean Architecture, no Redis, Supabase Storage, Zod/shared, simplicity). No `NEEDS CLARIFICATION` remain.

## R1 — HTML sanitizer (allowlist)

- **Decision**: `sanitize-html` (backend), configured as **one service with two named profiles**: `save` (forbids `<img>` entirely; allows `table/tr/td/th/thead/tbody`, headings, `p/span/div/strong/em/ul/ol/li/br/hr/blockquote`, `a[href]` with `http(s)`/`mailto`, inline `style`) and `render` (everything in `save` **plus** `img` whose `src` host equals the configured email-assets host, with `alt`/`width`/`height`).
- **Rationale**: `sanitize-html` is the de-facto, well-maintained Node allowlist sanitizer (declarative `allowedTags`/`allowedAttributes`/`allowedSchemes`/`allowedSchemesByTag` + `exclusiveFilter`), satisfying FR-005's "mature/established, not hand-rolled". Two profiles cleanly express the stage rule (FR-005a save vs FR-027 render) without two libraries.
- **Alternatives**: `isomorphic-dompurify` (needs a DOM/JSDOM on the server, heavier; DOMPurify shines client-side). Hand-rolled regex — rejected by FR-005 and unsafe.
- **`<img>` host restriction**: enforced in the `render` profile via `allowedTags` including `img` + an `exclusiveFilter`/transform that drops any `img` whose `src` is not on the trusted public-bucket host. The `save` profile simply omits `img` from `allowedTags`, so any literal `<img>` triggers a rejection at validation (we run sanitize and compare to input; if it stripped/changed anything, the body is non-conformant → reject, per FR-005a "validate-and-reject", never mutate-and-store).

## R2 — Save = validate-by-reject (not mutate)

- **Decision**: On save, run the `save`-profile sanitizer over the submitted body; if the sanitized output differs from the input (normalized), **reject** with the offending construct(s) surfaced; never persist the sanitized version. Additionally parse `{{image:key}}` occurrences and verify each resolves to an existing in-scope asset; reject unknown keys. Literal `<img>` ⇒ rejected (save profile has no `img`).
- **Rationale**: Honors FR-001/FR-005a/SC-005 (stored body byte-identical to submission) and the round-4/5 governance (no literal `<img>`, no orphan placeholders). Diff-based rejection is the standard way to turn an allowlist sanitizer into a validator.
- **Alternatives**: store-sanitized (rejected by human decision — would mutate); reject only external img (rejected by Crítico — same-host bypass).

## R3 — Plain-text derivation

- **Decision**: `html-to-text` package, run on the **rendered + sanitized** HTML (after image resolution) at send time to produce `bodyText`; images contribute `alt` text. Operators never author text (FR-007).
- **Rationale**: Mature, configurable (`selectors` to map `img`→alt, drop layout noise). Keeps html+text parity for deliverability (FR-008).
- **Alternatives**: naive tag-strip (loses structure/links); keeping the front-end's old strip heuristic (rejected — that's the implicit magic being removed).

## R4 — Image content verification (anti-spoof on a public bucket)

- **Decision**: On **confirm**, the backend (a) reads the uploaded object, (b) `file-type` sniffs the **magic bytes** to confirm one of `image/png|jpeg|webp|gif`, (c) `image-size` decodes real `width`/`height`, (d) verifies the sniffed type **equals the declared Content-Type used at presign**, and (e) enforces ≤ 5 MB actual size. Any failure ⇒ reject, discard the object, mark `UPLOAD_FAILED`. The object is then served with that **verified** Content-Type (which equals the declared one, now proven), so no `copyObject` rewrite is needed.
- **Rationale**: Closes the BLOCKER that MIME is attacker-controllable (FR-020). `file-type` + `image-size` are lightweight, pure-JS-friendly, and avoid `sharp`'s native-build weight. `svg` is detected (`image/svg+xml`) and rejected (active-content vector).
- **Alternatives**: `sharp` (decode+metadata, but native binary, heavier in CI/Fly); trusting MIME only (rejected — the BLOCKER).

## R5 — Public bucket + stable URL

- **Decision**: New **public** Supabase bucket `email-assets`, provisioned via the existing `provision-storage-buckets.ts` (`BUCKETS_EXPECTED`, public like `tenant-branding`). Public URL built with the same pattern as `supabase-branding-storage.service.ts#getPublicUrl`. Storage key: `tenants/{tenantId|platform}/library/{assetId}-{safeFilename}` (tenant-scoped, UUID assetId → non-guessable, collision-free).
- **Rationale**: Mirrors the existing public-bucket precedent; email clients fetch without auth and open emails far in the future, so signed URLs would break (spec Assumptions, FR-018). Object **retention** for ever-sent assets keeps historical emails intact (FR-026).
- **Alternatives**: private bucket + long-lived signed URL (breaks on expiry; Supabase signed-URL TTL caps); base64-in-HTML (rejected by FR-019, kills deliverability).

## R6 — Upload flow (presign → upload → confirm)

- **Decision**: Reuse the inspector-asset two-step pattern: `POST /v1/email-assets` (validate role/declared-type/size, create `PENDING` row, return `{ assetId, uploadUrl, storageKey, expiresAt }`, TTL 900 s via `createSignedUploadUrl`); client `PUT`s directly to storage; `POST /v1/email-assets/:id/confirm` runs R4 verification then marks `VERIFIED` (usable). Extend `IStorageService` with a public-URL builder (or add `IEmailAssetStorage` port composing it).
- **Rationale**: Exact existing analog (`request-asset-upload`/`confirm-asset-upload`), Clean-Architecture-aligned, minimal new surface.

## R7 — `{{image:key}}` resolver (distinct from Handlebars)

- **Decision**: A dedicated `ImagePlaceholderResolver` runs a regex pass (`/\{\{\s*image:([a-zA-Z0-9_-]+)\s*\}\}/g`) **before/around** the Handlebars data-variable render, replacing each with `<img src="{publicUrl}" alt="{alt}" width height>` from the asset + binding. The Handlebars `extractVariables`/render must **ignore** `image:`-prefixed tokens (they are not data variables). Order: resolve images → Handlebars render data vars → sanitize(render profile) → (send) html-to-text.
- **Rationale**: `{{image:key}}` is not a valid Handlebars identifier (colon); resolving it separately avoids engine conflicts (FR-024) and keeps it out of `variablesJson`/missing-variable warnings.
- **Alternatives**: a Handlebars helper `{{image "key"}}` — would entangle with the data engine and the variable catalog; rejected for separation/clarity.

## R8 — Preview fidelity (preview == send)

- **Decision**: Preview is produced by a **backend** `render-template-preview` use case + endpoint that runs the *same* pipeline (image-resolve → Handlebars render with `SAMPLE_DATA` → sanitize render-profile) and returns safe HTML; the web renders it in a **sandboxed `<iframe srcdoc>`** (`sandbox` without `allow-scripts`). Debounced on edit.
- **Rationale**: Guarantees SC-013 (preview == send) with one source of truth, and the iframe sandbox makes in-app rendering safe (FR-003) without trusting client-side sanitization. Locale/timezone for helpers comes from tenant config server-side, identical to send (FR-006).
- **Alternatives**: client-side DOMPurify + `dangerouslySetInnerHTML` — risks preview≠send divergence and duplicates the allowlist; rejected.

## R9 — Queue consolidation (single retry policy)

- **Decision**: One mechanism — the **notification worker self-reschedules** on failure via pg-boss `send(..., { singletonKey: notificationId, startAfter: delaySeconds })`, with the exact schedule `[15s,45s,2m,5m,15m]` (±10% jitter) and `MAX_RETRY_COUNT = 6`; **retire** the separate `notification.retry-poll` cron and the implicit pg-boss auto-retry for this queue (set its `retryLimit: 0` so it never double-retries). Enqueue dedup via `singletonKey: notificationId` (FR-013). Visibility via pg-boss `expireInMinutes: 1`→ set to **5** per attempt (FR-016). On the 6th failure, mark the Notification terminal `FAILED` with the final error (FR-015); optionally route the pg-boss job to a `deadLetter` queue internally for safety (not operator-facing).
- **Rationale**: Eliminates the double-retry (BLOCKER from round 1 of the pre-image critique). Self-reschedule preserves the exact business schedule that pg-boss's pure-exponential `retryBackoff` can't express, while `singletonKey` gives idempotency and `expireIn` gives visibility — all pg-boss-native, no Redis.
- **Alternatives**: rely on pg-boss `retryBackoff` (can't match the [15s,45s,2m,5m,15m] schedule); keep both mechanisms (the bug we're fixing).

### R9a — Queue cutover (explicit, safe)

The retry-poll schedule is **persisted** in pg-boss (`q.schedule(...)`), so removing code alone leaves a ghost cron. Cutover steps:
1. **Unschedule** on startup: call `boss.unschedule('notification.retry-poll')` (idempotent) and stop registering it; delete the cron-registration + `RETRY_DELAYS`/poll code (Simplicity — no flag).
2. **Drain the backlog**: existing notifications with `next_retry_at` set were driven by the poll. A one-time bootstrap on deploy re-enqueues every non-terminal notification that has a due/pending `next_retry_at` via the **new** path (`sendJob(name, data, { singletonKey: notificationId, startAfter })`). Because enqueue is `singletonKey`-deduped, running the bootstrap is safe even if a job is already queued.
3. **Manual retry** (`POST /v1/notifications/:id/retry`): re-enqueues through the same single path (`sendJob` with `singletonKey: notificationId`) — never the old poll.
4. **Create path also uses singletonKey**: the *first* enqueue (on notification creation) ALSO sets `singletonKey: notificationId`, so a duplicate create+enqueue collapses to one job (FR-013 holds for create, retry, and bootstrap alike).
5. **No double-retry**: the notification queue is created with pg-boss `retryLimit: 0` so pg-boss never auto-retries; all retries flow through the worker's self-reschedule. A test asserts a single failing job produces exactly one re-enqueue per attempt.
- **Ordering risk** (Planejador): the bootstrap (step 2) must run *after* the worker is registered with the new policy and *after* unschedule (step 1), else a brief window could let the old poll and the new path both run. Deploy ordering: unschedule → register new worker → bootstrap drain.

## R10 — Frontend editor + modal

- **Decision**: Refactor `TemplateFormDrawer` to a plain raw-HTML `<textarea>` whose value is sent verbatim (delete the HTML-auto-detect/bifurcation in `useTemplateSave`). Add an "Images" toolbar action opening a new `ImageLibraryModal` built on the existing `Dialog` + a `FileUploadStep`-style dropzone; insertion writes `{{image:key}}` at the cursor (reuse the cursor-insert logic already in the variable toolbar). `TemplatePreview` becomes the sandboxed iframe.
- **Rationale**: Reuse existing components (Simplicity); the only deletions are the implicit-magic paths the client rejected.

## Cross-cutting

- **Audit (FR-011)**: extend `UpsertNotificationTemplateUseCase` audit to include `before`/`after` body (today it logs only `{templateCode, channel, isActive}`). Asset upload/delete also audited.
- **Multi-tenant**: `email_assets.tenant_id` nullable (platform-level for platform-default templates); all repos tenant-scoped; AM/OP cross-tenant via validated `tenantId`.
- **New deps to add** (`apps/backend`): `sanitize-html`, `html-to-text`, `file-type`, `image-size` (+ `@types/sanitize-html`, `@types/html-to-text`).
