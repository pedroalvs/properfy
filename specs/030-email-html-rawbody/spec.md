# Feature Specification: Raw-HTML Email Body + Image Library + Notification Queue Hardening

**Feature Branch**: `refactor/email` (spec dir `030-email-html-rawbody`)
**Created**: 2026-06-01
**Status**: Draft
**Input**: User description: "Refactor the email-sending feature (web + backend) so operators compose the email body as RAW HTML, with existing dynamic variables working inside it; sanitize the HTML; auto-derive the plain-text part; audit body changes; validate the Resend send flow end-to-end; harden the pg-boss notification queue to market-standard robustness; AND add structured image support — a managed image library (dedicated bucket, upload/reuse/delete) with friendly `{{image:key}}` placeholders that resolve to real `<img>` in both preview and the delivered email, so operators never hand-write image tags or paste raw URLs."

## Context & Problem Statement

Today the email-template composer is **not** a structured/visual builder. It is a plain text field that **implicitly auto-detects** HTML tags and silently splits the operator's content into an HTML body and a stripped plain-text body, while the preview shows the HTML as **literal text** (never rendered). Operators cannot reliably see what the recipient will receive, and the implicit splitting is opaque. The client wants an **explicit raw-HTML authoring flow**: what the operator types **is** the HTML email body, dynamic variables keep working inside it, and the preview shows the **rendered** email.

Operators also need **first-class image support** when authoring those HTML emails. Today the only way to put an image in an email is to hand-write an `<img>` tag with a pasted URL — there is no asset management, no reuse, no governance, and no guarantee the URL stays reachable. This feature adds a **managed image library**: operators upload images into a dedicated email-assets store, browse/insert/reuse/delete them from a modal in the editor, and insert friendly `{{image:key}}` placeholders that the system resolves to real `<img>` elements (pointing at a stable, public asset URL) in both the editor preview and the delivered email. The model cleanly separates the **physical asset** (the stored file) from the **logical placeholder** (the friendly name used inside a template), so images are reusable, traceable to where they are used, and cannot be deleted out from under a template silently.

Separately, the notification **delivery queue** (job-based async sending) must be confirmed robust to market standards: no lost or duplicated emails, predictable retries, an explicit dead-letter path, and reclamation of stuck jobs.

## Clarifications

### Session 2026-06-01

Four product/security decisions were resolved with the product owner before drafting (recorded under Assumptions and reflected in the requirements): HTML sanitization via an email allowlist applied at save/preview/send; the plain-text part is backend-derived (operators author only HTML); template edits audit the body before/after; and the queue's critical gaps are fixed inline in this feature.

Three technical edge cases were then clarified:

- Q: What is the "same logical notification" for de-duplicating sends (idempotency key)? → A: The Notification row itself — de-duplicate by `Notification.id`. Re-enqueues of the same row (whether from the provider/job retry or the retry-poll cron) MUST collapse to a single send. If two distinct Notification rows are created for the same business event, that is an upstream creation/idempotency concern, NOT something the queue suppresses (no business-key de-dup at the queue, to avoid suppressing legitimate re-sends).
- Q: Where does an operator see jobs that have exhausted retries (dead-letter)? → A: The canonical operational surface is the Notification entity, not a separate technical-job UI. Retry exhaustion is exposed as a terminal status on the Notification (shown as `FAILED` with the final error detail) via the existing notifications listing, and operators re-drive it with the existing manual retry action. A native dead-letter mechanism in the job system MAY exist internally for safety, but is not the operator-facing surface and `DEAD_LETTER` is not the primary UX language.
- Q: How permissive should the email HTML sanitization allowlist be? → A: Adopt a mature, well-established HTML sanitizer configured with an email-oriented allowlist — permit layout tags (`table`/`tr`/`td`), inline styles, images, and links with `http(s)`/`mailto` URLs, while removing `<script>`, `on*=` event handlers, and `javascript:`/executable `data:` URLs. (Balance of design fidelity vs. safety; not a strict minimal list, not fully permissive.)

Round-2 clarifications (resolving the Crítico's REPROVADA findings):

- Q: "Stored exactly as typed" conflicts with "sanitize at save" — where does sanitization live and what is persisted? → A: **Reject the save when the body contains anything outside the email allowlist.** The operator gets a clear error identifying the offending tags/attributes and fixes the body before it can be saved. Consequently the persisted body is byte-identical to what the operator submitted (because only allowlist-conformant HTML can be stored) — sanitization at save is **validation-that-rejects**, never silent mutation. Preview and send still pass content through the sanitizer (preview because it may render unsaved/in-progress edits; send as idempotent defense-in-depth on already-validated content). This removes the contradiction: a stored body is, by construction, both "exactly as saved" and safe.
- Q: Exact retry/backoff/visibility/expiry parameters for queue acceptance? → A: One coherent policy with concrete, testable values (see "Queue Policy Parameters" below): max 6 delivery attempts; exponential backoff with jitter over the schedule 15s → 45s → 2m → 5m → 15m; per-attempt visibility/expiry of 5 minutes (a stalled in-flight job is reclaimed after 5 min); failed-job retention 30 days. The two current overlapping retry mechanisms collapse into this single policy.
- Q: How is the real test-send kept safe in the shared Resend environment? → A: Test-send MUST enforce a configured **recipient allowlist** (a small set of safe test addresses / a single test inbox provided by configuration). A test-send to any recipient not on the allowlist is refused. This guards against accidentally emailing a real contact during QA/manual validation in the shared environment.
- Q: Is CL_ADMIN intentionally outside the new web authoring/test-send flow? → A: Yes — this refactor preserves the **current** surfaces (web authoring/test-send exposed to AM/OP, as today; backend authorization unchanged at AM/OP/CL_ADMIN). Giving CL_ADMIN a new web surface is out of scope (consistent with the "no RBAC matrix change" non-goal). The known frontend/backend divergence is preserved deliberately, not introduced by this feature.
- Q: Preview behavior when sample rendering fails or sample data is missing? → A: The preview MUST degrade explicitly: on a template/render error (e.g. malformed Handlebars) it shows a clear inline error message in the preview pane (never a crash/blank); when a referenced variable has no sample value it shows a visible labelled placeholder (e.g. the literal `{{variableName}}`) rather than empty output.
- Q: Which locale/timezone governs `formatDate`/`formatCurrency` in preview vs. real send? → A: The same locale/timezone MUST govern both, sourced from the tenant/agency configuration when available, otherwise a platform default. The testable guarantee is **preview-equals-send**: identical helper inputs render identically in preview and in the delivered email.

### Session 2026-06-01 (image-library scope addition, approved by product owner)

The product owner approved adding structured image support (additive to all prior decisions). Direction and the defaults adopted for it:

- Q: How do operators put images in emails? → A: Via a **managed image library**, not by hand-writing `<img>` or pasting raw URLs. An "Images" action in the editor toolbar opens a modal to upload, browse, preview, insert, reuse and delete images. Inserting an image places a friendly `{{image:placeholder_key}}` placeholder (e.g. `{{image:hero_banner}}`) into the body automatically; the operator does not type the tag. The stored body keeps the placeholder; preview and send resolve it to a real `<img>`.
- Q: Physical asset vs. logical placeholder? → A: They are separated. The **asset** is the real stored file (in a dedicated email-assets store) with a tenant-unique friendly key; a **binding** records that a given template uses a given asset via a placeholder, capturing per-use `alt`/width/height. This gives reuse and "where is this image used" traceability.
- Q: How is the image served into the email — public URL or signed URL? → A: **Public, stable URL from a dedicated public bucket** (default, mirroring the existing public `tenant-branding` bucket). Rationale: email clients fetch images without cookies/auth, and emails are opened arbitrarily far in the future, so a time-limited signed URL would break images; tenant-scoped paths with a non-guessable asset id mitigate enumeration. (Assumption — see Assumptions.)
- Q: What happens when an operator deletes an image that is in use? → A: **Safe and explicit — never silent.** Hard delete is **blocked** while the asset is bound to one or more templates; the UI shows the list of templates/placeholders using it so the operator can remove those usages first. *(Unbound-deletion behavior in this bullet is **SUPERSEDED by round-6** below: unbound assets are really purged after a mandatory modal — no soft-delete/retain.)*
- Q: Allowed image types? → A: `png`, `jpeg/jpg`, `webp`, and optionally `gif`. Explicitly **blocked**: `svg` (active-content/XSS vector), executable/ambiguous formats, and non-image files — validated by MIME at presign and re-verified on confirm. (Assumption — see Assumptions.)
- Q: How do `{{image:key}}` placeholders coexist with Handlebars `{{variable}}` data variables? → A: Image placeholders are resolved by a **dedicated resolver pass distinct from the Handlebars data-variable engine**; they are NOT treated as data variables (not extracted into the template's variable set, not subject to the missing-variable warning). Resolution happens at preview and at send, producing a trusted `<img>` that the sanitizer permits.

Round-4 clarifications (resolving the Crítico's REPROVADA on the image redesign):

- Q: Does deleting an asset (when no template references it) break images in already-sent emails that still point at its public URL? → A: ***SUPERSEDED by round-6 (final rule).*** *(The round-4 answer required retaining ever-sent objects permanently and allowing only logical delete. The product owner overrode this: an unbound asset is really purged after a mandatory confirmation modal, and if it was ever sent the modal warns that historical emails may break. See round-6.)*
- Q: How is a public-bucket asset guaranteed to be a real allowed image (MIME is attacker-controllable)? → A: Validation MUST be **content-based**, not MIME-only. On confirm, the backend MUST verify the stored object's actual bytes (magic-number/format sniffing) and successfully decode it as one of the allowed raster formats (`png`/`jpeg`/`webp`/optional `gif`) — capturing real dimensions — before the asset becomes usable; otherwise the upload is rejected and the object discarded. The **served `Content-Type` MUST be set from the server-verified type**, never from the client-declared MIME, and objects are served with safe response headers. The presign-time MIME check is only a fast pre-filter, not the security boundary.
- Q: Where does the operator set/edit `alt` text and dimensions per use? → A: In the image flow itself: when inserting an image the operator can set/confirm its `alt` text (and optionally width/height), defaulting `alt` from the friendly key/filename and dimensions from the asset's intrinsic size; an existing placeholder's binding can be edited later from the library/usage affordance. These per-binding values feed both preview and send.
- Q: Is the manual `<img src="…">` bypass part of the product? → A: No — it would gut the governance the library promises. (Initial resolution restricted `<img src>` to the trusted host; tightened in round-5 below to forbid literal `<img>` entirely at save.) Links `<a href>` remain general `http(s)`/`mailto`.

Round-5 clarifications (resolving the Crítico's APROVADA-COM-RESSALVAS MAJORs on the image redesign):

- Q: Should save reject a `{{image:key}}` that is unknown/out-of-scope (a typo in a raw editor)? → A: Yes. Save MUST validate that every `{{image:key}}` placeholder resolves to an existing, same-tenant-scope asset and reject the save (identifying the bad key) otherwise. No orphan placeholders persist; a typo cannot become a saved template with a broken image.
- Q: Restricting `<img src>` to the asset host still allows a manual same-host `<img>` with no binding — how is that closed? → A: A saved body MUST contain **no literal `<img>` at all** (external or same-host) — images are expressed exclusively as `{{image:key}}` placeholders, which are always bound to an asset. The resolver injects the `<img>` only at render time. This removes every manual-`<img>` path, so all images are traceable via bindings.
- Q: What is the concrete maximum image file size for acceptance? → A: **5 MB per image** (aligned with the existing inspector-avatar bucket; appropriate for email deliverability), enforced at presign (declared size) and re-enforced on confirm (actual object size).

### Session 2026-06-01 (round-6 — FINAL image-deletion rule, product-owner override)

This **supersedes** the round-4 "retain-forever for ever-sent assets" model.

- Q: Final deletion rule for image assets? → A: **Usage-gated with informed consent.** (1) An image **in use** (bound to ≥1 template) → deletion **blocked**; the UI clearly states it is in use, **which** templates use it, and that it must be removed from them first; never silent. (2) An **unbound** image → deletion **may proceed as a real purge** (stored object removed), but only after a **mandatory confirmation modal**. (3) The `ever_sent` marker **no longer blocks** deletion — it only selects the modal's **warning copy**: an ever-sent asset's modal warns that previously delivered emails may stop displaying the image.
- Q: Confirmation modal copy? → A: Title `Delete image?`; message `This image is no longer used in any template, so it can be deleted. However, if this image was already included in emails that have been sent, those emails may no longer display the image correctly after deletion.` (Directer variant acceptable — see FR-026a.)
- **Impact on historical emails (explicit)**: under the old rule, an ever-sent object was retained forever, so historical emails never broke. Under this final rule, an unbound asset can be purged, and if it was used in already-delivered emails, those emails may **stop displaying that image**. This risk is **accepted** by the product owner and surfaced to the operator via the mandatory modal at delete time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author an email template as raw HTML with working variables (Priority: P1)

An operator opens a notification email template, writes the body as raw HTML directly (e.g. `<table>...</table>`, headings, inline-styled buttons), inserts dynamic variables from the variable toolbar (which places `{{variableName}}` at the cursor), sees a live **rendered** preview using sample data, and saves. The saved template is the source of truth for that tenant + template code + channel.

**Why this priority**: This is the core client demand and the entry point for every email that goes out. Without it, nothing else has value.

**Independent Test**: Open a template, type HTML containing at least one variable, confirm the preview renders the HTML (not literal tags) with sample values substituted, save, reload, and confirm the exact HTML round-trips. Delivers value as a standalone authoring capability even before send-flow changes.

**Acceptance Scenarios**:

1. **Given** an operator on the template editor, **When** they type raw HTML containing `{{tenantName}}`, **Then** the editor stores that HTML verbatim as the body and the variable toolbar can insert further allowed variables at the cursor.
2. **Given** a template body of raw HTML with variables, **When** the operator views the preview, **Then** the HTML is rendered visually (tables, styles, links visible) and each `{{variable}}` is replaced by its sample value.
3. **Given** a saved raw-HTML template, **When** the operator reopens it, **Then** the HTML body is shown exactly as saved (no implicit re-splitting or stripping).
4. **Given** an operator inserts a variable that is not in the template's allowed-variable set, **When** they save, **Then** the system surfaces the unknown variable (warning) consistent with the existing allowed-variable catalog.
5. **Given** an operator's body contains a disallowed construct (e.g. `<script>`, an `on*=` handler, or a `javascript:` URL), **When** they attempt to save, **Then** the save is rejected with a clear error identifying the offending construct(s) and nothing is persisted until it is fixed.

### User Story 2 - Manage and use images via the email image library (Priority: P1)

An operator authoring an email clicks an "Images" action in the editor toolbar, which opens an image library modal. There they can upload a new image, see the images already available (with a friendly name/key and a thumbnail), select one to insert, and remove images they no longer need. Inserting an image automatically places a friendly `{{image:hero_banner}}` placeholder at the cursor (the operator never hand-writes a tag or pastes a URL). The editor preview shows the placeholder resolved to the real image, and the delivered email contains a real `<img>` pointing at a stable asset URL. The same image can be reused across templates, and the system knows where each image is used so it cannot be deleted out from under a template silently.

**Why this priority**: Using images is a core part of authoring real-world marketing/notice emails. The client explicitly wants this to be simple, governed, and free of hand-written tags/URLs — it is a direct, emphasized demand and complements raw-HTML authoring (US1).

**Independent Test**: Open the image modal, upload a PNG, confirm it appears in the library; insert it and confirm a `{{image:key}}` placeholder is added and the preview renders the real image; send a test email and confirm the recipient sees the image via a stable URL; attempt to delete an in-use image and confirm it is blocked with the list of templates using it.

**Acceptance Scenarios**:

1. **Given** an operator in the editor, **When** they open the Images modal and upload a permitted image (png/jpeg/webp), **Then** the image is stored in the dedicated email-assets bucket and appears in the library with a thumbnail and friendly key.
2. **Given** images exist in the library, **When** the operator selects one and clicks Insert, **Then** the system inserts a `{{image:placeholder_key}}` placeholder at the cursor automatically (no hand-typed tag), and the same asset can be inserted into multiple templates (reuse).
3. **Given** a body containing `{{image:hero_banner}}`, **When** the operator views the preview, **Then** the placeholder is resolved and displayed as the real image (not as literal text), using the asset's `alt`/dimensions.
4. **Given** a template with image placeholders, **When** the email is sent, **Then** each `{{image:key}}` is resolved to a real `<img>` whose `src` is the asset's stable public URL, and the recipient sees the image.
5. **Given** an image that is bound to one or more templates, **When** the operator tries to delete it, **Then** the deletion is **blocked** and the UI clearly states it is still in use, lists exactly which templates use it, and says it must be removed from those templates first; it is never deleted silently.
6. **Given** the operator uploads a disallowed file (e.g. `svg`, or an active file disguised with an image MIME), **When** the backend confirms it, **Then** content-based verification (byte sniffing + decode) fails and it is rejected with a clear error; the object never becomes a usable library image.
7. **Given** an unbound image (no template references it), **When** the operator deletes it, **Then** a mandatory confirmation modal appears ("Delete image?") and, only on confirm, the asset is **really purged** (stored object removed + record deleted); cancel aborts with no change.
8. **Given** an unbound image that was already included in sent emails, **When** the operator opens the delete confirmation, **Then** the modal warns that previously delivered emails may no longer display the image correctly after deletion (informed consent); confirming purges it anyway.
9. **Given** the operator is inserting an image, **When** they set its `alt` text (and optionally width/height), **Then** those per-use values are stored on the binding and used in both preview and the sent email; an existing placeholder's `alt`/dimensions can be edited afterward.
10. **Given** the operator hand-writes any literal `<img>` (whether external or pointing at the asset host) instead of using a placeholder, **When** they save, **Then** the save is rejected (a saved body may contain no literal `<img>`; images are added only via the library, which inserts a bound `{{image:key}}` placeholder).
11. **Given** the operator types or edits a `{{image:key}}` whose key does not match any existing in-scope asset, **When** they save, **Then** the save is rejected identifying the unknown key, so a typo cannot persist as a broken image.

### User Story 3 - Safe, faithful delivery via Resend (sanitized HTML + auto text part) (Priority: P1)

When a notification is sent, the system renders the operator's HTML with the real recipient values, **sanitizes** it with an email-oriented allowlist, derives a plain-text alternative from the HTML, and sends both HTML and text parts through the email provider. The recipient receives the intended, rendered email; malicious or unsafe markup never reaches the recipient or the in-app preview.

**Why this priority**: The feature must ship "100% functional and tested end-to-end." A faithful, safe send is the whole point; it is co-critical with authoring.

**Independent Test**: Trigger a real send (test-send) of a raw-HTML template to a safe test inbox; confirm the received email renders the HTML, variables are substituted with real values, a plain-text alternative is present, and any script/handler/`javascript:` content was removed.

**Acceptance Scenarios**:

1. **Given** a raw-HTML template with variables, **When** a notification is sent, **Then** the recipient receives an email whose HTML matches the authored HTML with variables resolved to the recipient's real values.
2. **Given** content that (despite save-time validation) reaches preview or send carrying `<script>`, an `on*=` event handler, or a `javascript:` URL, **When** it is previewed or sent, **Then** that content is removed/neutralized by the sanitizer (defense-in-depth) while email-safe tags and inline styles (e.g. tables, images, basic formatting) are preserved.
3. **Given** a sent email, **When** it is delivered, **Then** it includes both an HTML part and a plain-text part, the plain-text part being derived from the HTML.
4. **Given** an operator never authored a separate plain-text body, **When** the email is sent, **Then** the system still includes a non-empty plain-text alternative derived from the HTML.
5. **Given** a tenant has no customized template for a given code + channel, **When** a notification is sent, **Then** the platform-default template is used (fallback preserved).

### User Story 4 - Auditable template changes (Priority: P2)

When an operator changes a template body, the audit trail records who changed it and captures the body content before and after the change, so changes to legally-significant tenant-facing content are traceable.

**Why this priority**: Important for compliance/traceability but does not block authoring or sending; can be delivered as an increment.

**Independent Test**: Edit a template body, then inspect the audit record and confirm it contains the prior and new body content along with actor and template identity.

**Acceptance Scenarios**:

1. **Given** an existing template, **When** an operator saves a changed body, **Then** an audit record is created containing the previous body and the new body (plus actor, template code, channel, tenant scope).
2. **Given** a newly created template (no prior version), **When** it is saved, **Then** the audit record captures the new body with an empty/absent "before" value.

### User Story 5 - Robust, predictable delivery queue (Priority: P2)

The asynchronous notification queue handles retries, failures, duplicates, and stuck jobs predictably: a send is not duplicated, transient failures retry with backoff up to a defined limit, permanently failed notifications surface as a terminal `FAILED` status on the Notification (operator-visible and re-drivable), and a job that stalls is reclaimed and retried rather than lost.

**Why this priority**: Required by the explicit "investigate the queue / market-standard" demand and protects deliverability, but the authoring + send slices can be demonstrated before the full hardening lands.

**Independent Test**: Inject a transient provider failure and confirm bounded retries with backoff; exhaust retries and confirm the Notification reaches terminal `FAILED` (visible in the existing listing, manually re-drivable); enqueue the same Notification row twice and confirm only one email is sent; simulate a stalled job and confirm it is reclaimed.

**Acceptance Scenarios**:

1. **Given** the same logical notification is enqueued more than once (e.g. retry of an API call, at-least-once delivery), **When** the queue processes it, **Then** at most one email is sent (idempotent enqueue/processing).
2. **Given** a transient send failure, **When** the job is retried, **Then** retries follow a single, predictable backoff policy up to a defined maximum (no conflicting double-retry behavior).
3. **Given** a job that exhausts its retry limit, **When** it finally fails, **Then** the corresponding Notification shows a terminal `FAILED` status with the final error detail in the existing notifications listing (not silently dropped), and an operator can manually re-drive it.
4. **Given** a worker crashes mid-processing, **When** the visibility window elapses, **Then** the job becomes available again and is processed (no permanent loss).
5. **Given** normal operation, **When** notifications are sent, **Then** there is no observed duplicate delivery to the same recipient for the same notification.

### Edge Cases

- Operator saves an **empty** body, or a body with only whitespace → save is rejected; the body remains required (consistent with current rules).
- Authored HTML is **malformed** (unclosed tags) → sanitization/rendering degrades gracefully; the send still produces a valid email and a text alternative.
- HTML contains an external image or link → preserved (allowlist permits `img`/`a` with safe URLs).
- Operator submits HTML containing a disallowed tag/attribute or a `javascript:`/executable `data:` URL → **save is rejected** with an error listing the offending construct(s); nothing is persisted until the operator fixes it.
- Operator triggers a test-send to a recipient not on the configured allowlist → the test-send is refused with a clear message; no email is dispatched.
- A variable referenced in the HTML has **no value** at send time → existing behavior preserved (the system warns; the placeholder is handled as today rather than crashing the send).
- A body references an `{{image:key}}` whose asset no longer exists / was deleted / never resolved → the system surfaces it explicitly (e.g. a broken-image indicator in preview and a clear warning), and the send does not crash; an unresolved image placeholder MUST NOT be emitted as literal `{{image:key}}` text to the recipient.
- Operator inserts the same image twice or the same `{{image:key}}` appears multiple times → all occurrences resolve to the same asset; the binding records the usage without duplication errors.
- An upload is presigned but the file never arrives (confirm fails the storage HEAD check) → the asset stays in a non-usable PENDING/UPLOAD_FAILED state and does not appear as a usable library image.
- An unbound asset (no template references it) → deletable after the mandatory confirmation modal; on confirm the stored object is **really purged** (no retain-forever path). A never-sent unbound asset shows the plain confirmation; an ever-sent unbound asset shows the historical-email warning copy.
- An asset is unbound from all templates but was previously delivered in emails, and the operator confirms deletion → the object is purged and its public URL stops resolving; **already-delivered emails referencing it may stop displaying the image** — this is accepted via the informed-consent modal (FR-026a).
- A platform-default template (tenant scope `null`) references an image → images are scoped consistently with template scope (platform-level assets for platform-default templates; tenant assets for tenant templates).
- Operator hand-writes any literal `<img>` (external URL or even one pointing at the asset host) → **rejected at save** (a saved body contains no literal `<img>`); images are added only via the library, which inserts a bound `{{image:key}}` placeholder.
- Operator types/edits a `{{image:key}}` that does not match an existing in-scope asset → **rejected at save** identifying the unknown key (no orphan placeholders persist).
- A file is uploaded with an image MIME but its actual bytes are not a decodable allowed raster image (e.g. disguised svg/HTML) → content verification on confirm fails; the asset is rejected and the object discarded; nothing is served publicly as an image.
- The plain-text derivation of a large/complex HTML yields a very long or sparse text → text part is still well-formed and non-empty.
- Two workers pick up the same job concurrently → idempotency/locking ensures a single send.
- A Notification at terminal `FAILED` is manually retried by an operator → it re-enters processing under the same idempotency guarantees (keyed by `Notification.id`).

## Requirements *(mandatory)*

### Functional Requirements

#### Authoring (web)
- **FR-001**: Operators MUST author an email template body as raw HTML in an explicit HTML editor; the stored body MUST be exactly what the operator submitted (no implicit tag-detection, auto-splitting, or silent rewriting). Because save is gated by allowlist validation (FR-005), any persisted body is by construction both byte-identical to what was submitted and allowlist-conformant.
- **FR-002**: The editor MUST preserve the variable-insert toolbar, inserting the canonical `{{variableName}}` placeholder at the cursor, scoped to the allowed variables for the current template code (with the global allowed-variable set as fallback).
- **FR-003**: The editor MUST provide a live preview that **renders** the HTML (not literal text) with sample values substituted for variables, and that preview MUST be safe to render inside the application (sanitized). The preview MUST degrade explicitly: on a template/render error (e.g. malformed Handlebars) it shows a clear inline error in the preview pane (never a crash or blank screen); when a referenced variable has no sample value it shows a visible labelled placeholder (e.g. the literal `{{variableName}}`) rather than empty output.
- **FR-004**: The system MUST continue to support the existing variable syntax and helpers (Handlebars `{{ }}`, including the existing `formatDate`/`formatCurrency` helpers) inside the HTML body and subject.

#### Sanitization & rendering (backend)
- **FR-005**: The system MUST define one email-oriented HTML allowlist (using a mature/established sanitizer, not a hand-rolled regex) that permits layout tags (`table`/`tr`/`td`), inline styles, and links (`<a href>`) with `http(s)`/`mailto` URLs, and rejects/removes `<script>`, inline `on*=` event handlers, and `javascript:`/executable `data:` URL schemes. Images are governed by stage (FR-005a / FR-005c / FR-027): a **saved** body contains no literal `<img>` (only `{{image:key}}` placeholders), while a **rendered** body (preview/send) may contain `<img>` whose `src` is on the trusted email-assets host. This is intentionally neither a strict minimal list nor fully permissive. This single allowlist governs all points below.
- **FR-005a (save = validate-and-reject)**: On save, the system MUST validate the body and **reject** it (with a clear error identifying the offending construct) if it contains any disallowed tag/attribute/URL scheme, returning without mutating the body. To keep all images inside the governed library flow, a saved body MUST NOT contain any literal `<img>` element at all — images are expressed exclusively as `{{image:key}}` placeholders; a hand-written `<img>` (even one pointing at the asset host) is rejected. Additionally, save MUST validate that every `{{image:key}}` placeholder in the body resolves to an existing, in-scope (same tenant scope) asset, and reject the save (identifying the bad key) if any placeholder is unknown/out-of-scope, so a typo cannot persist as a broken image. A successfully saved body is therefore byte-identical to what was submitted, free of literal `<img>`, and references only real in-scope image assets.
- **FR-005b (preview = sanitize-on-render)**: The live preview MUST render through the sanitizer so that even unsaved/in-progress edits are safe to display inside the application.
- **FR-005c (send = sanitize defense-in-depth)**: At send time the system MUST pass the (already validated) content through the same sanitizer as an idempotent safety net before handing it to the email provider.
- **FR-006**: The system MUST resolve dynamic variables to recipient-specific values at send time and to sample values at preview time, using the existing rendering engine. The locale/timezone governing the `formatDate`/`formatCurrency` helpers MUST be identical between preview and real send (sourced from tenant/agency configuration when available, otherwise a platform default), so the previewed render of given inputs equals the delivered render of the same inputs.
- **FR-007**: The system MUST derive the plain-text alternative automatically from the (sanitized, image-resolved) HTML on the backend; operators do NOT author a separate plain-text body. Images contribute their `alt` text (when present) to the derived plain-text rather than raw markup or placeholders.
- **FR-008**: The system MUST send each email with both an HTML part and a non-empty plain-text part.

#### Multi-tenant, RBAC, audit
- **FR-009**: The system MUST preserve per-tenant templates with fallback to the platform-default template (tenant scope `null`) when a tenant has not customized a given template code + channel.
- **FR-010**: The system MUST preserve the current authorization model for template management: backend authorization stays AM/OP/CL_ADMIN, and the web authoring/test-send surface stays exposed to AM/OP exactly as today. No change to the RBAC matrix. CL_ADMIN retains its existing backend capability but is **not** granted a new web surface by this feature; the pre-existing frontend/backend divergence is deliberately preserved, not introduced or resolved here (out of scope). Image-library actions (upload/insert/delete) are part of the same template-authoring surface and follow the same authorization; image assets are tenant-scoped under the same multi-tenant rules as templates.
- **FR-011**: The system MUST record an audit entry for every template create/update that captures the body content **before** and **after** the change, in addition to actor, template code, channel, and tenant scope.

#### Send flow validation
- **FR-012**: The system MUST provide a way to send a real test email of a raw-HTML template that exercises the full validate → render → sanitize → derive-text → send path, so the flow can be validated end-to-end.
- **FR-012a (test-send recipient guard)**: In the shared environment, test-send MUST enforce a configured **recipient allowlist** (a small set of safe test addresses / a single configured test inbox). A test-send whose recipient is not on the allowlist MUST be refused, so QA/manual validation cannot accidentally email a real contact.

#### Queue robustness
- **FR-013**: The notification queue MUST process each logical notification with at-most-once delivery semantics from the recipient's perspective, keyed by `Notification.id`: re-enqueues of the same Notification row (from job retry or the retry-poll cron) MUST collapse to a single send. The queue MUST NOT de-duplicate by business key; creating two distinct Notification rows for one event is an upstream concern, not suppressed by the queue.
- **FR-014**: The queue MUST apply a single, predictable retry policy with the parameters defined in "Queue Policy Parameters" below (max 6 attempts; exponential backoff with jitter over 15s → 45s → 2m → 5m → 15m), eliminating the current conflicting/duplicated retry mechanisms (provider/job-level retry vs. the app-level retry-poll) so a notification is retried under exactly one coherent policy.
- **FR-015**: When a notification exhausts its retry limit, the system MUST expose this on the Notification entity as a terminal status (surfaced as `FAILED` with the final error detail) in the existing notifications listing, and MUST allow operators to re-drive it via the existing manual retry action. A native dead-letter mechanism in the job system MAY be used internally for safety, but the operator-facing surface is the Notification, not a separate technical-job view.
- **FR-016**: The queue MUST reclaim and reprocess jobs that stall (e.g. worker crash) via a defined visibility/expiry window of 5 minutes (see "Queue Policy Parameters"), so no notification is permanently lost.
- **FR-017**: The queue's retry, dead-letter, idempotency, visibility, and backoff behavior MUST be documented (a written assessment of current vs. target behavior is a deliverable of this feature).

#### Queue Policy Parameters

These are the concrete, testable values that define queue acceptance (they consolidate today's two overlapping mechanisms into one policy; the current code uses the same family of values):

- **Idempotency key**: `Notification.id` (single-send guarantee per Notification row; FR-013).
- **Max delivery attempts**: 6 (initial attempt + retries), after which the Notification reaches terminal `FAILED` (FR-015).
- **Backoff schedule**: exponential with ±10% jitter over 15s → 45s → 2m → 5m → 15m between attempts.
- **Visibility / expiry window**: 5 minutes per in-flight attempt; a job not completed within the window is considered stalled and becomes eligible for reclaim/reprocessing (FR-016).
- **Failed-job retention**: 30 days for queue records (operator-facing state lives on the Notification entity, not the raw job).
- **Single engine**: one of the two existing retry mechanisms is retired so that exactly one policy drives retries (no double-retry). The choice of mechanism is an implementation detail for planning; the parameters above are the acceptance contract.

#### Image library & assets
- **FR-018 (dedicated store)**: Email images MUST be stored in a dedicated email-assets store (a dedicated public bucket), separate from other file storage, as the canonical source for images used in templates. Storage paths MUST be tenant-scoped, stable, and collision-free.
- **FR-019 (upload flow)**: Image upload MUST use a real direct-to-storage flow (not base64 embedded in the HTML): the client requests an upload authorization, the backend validates permission/declared-type/size and returns an upload target + storage key, the client uploads the file directly to storage, and the backend then **confirms** the upload before the asset becomes usable. Confirm MUST go beyond an existence check — see FR-020 for content verification. Failed/unconfirmed/unverified uploads MUST NOT appear as usable library images.
- **FR-020 (content-based validation & limits)**: Allowed image content is `png`, `jpeg/jpg`, `webp` (and optionally `gif`). Because the bucket is public and the declared MIME is attacker-controllable, validation MUST be **content-based, not MIME-only**: on confirm the backend MUST inspect the stored object's actual bytes (magic-number/format sniffing) and successfully **decode** it as one of the allowed raster formats (capturing real width/height) before the asset is usable; anything that fails (including `svg`, executable/ambiguous, or non-image content disguised with an image MIME) MUST be rejected and the stored object discarded. The object MUST be **served with a `Content-Type` derived from the server-verified type** (never the client-declared MIME) plus safe response headers. The presign-time declared-MIME/extension check is a fast pre-filter only, not the security boundary. A maximum file size of **5 MB per image** MUST be enforced (chosen for email deliverability and aligned with the existing inspector-avatar bucket limit), rejected at presign by declared size and re-enforced on confirm by actual object size.
- **FR-021 (library modal)**: The editor MUST provide an "Images" action that opens a library modal allowing the operator to: view existing images (thumbnail + friendly key), upload a new image, preview an image, select an image to insert, edit a usage's `alt`/dimensions, and delete an image.
- **FR-022 (placeholder insertion + per-use metadata)**: Inserting an image MUST automatically place a friendly `{{image:placeholder_key}}` placeholder (e.g. `{{image:hero_banner}}`) into the body at the cursor. The operator MUST NOT be required to hand-write an `<img>` tag; a raw technical identifier (e.g. a UUID) MUST NOT be the primary UX. At insertion the operator MUST be able to set/confirm the `alt` text (defaulting from the friendly key/filename) and MAY set width/height (defaulting to the asset's intrinsic dimensions); these per-use values are stored on the binding (FR-023) and used by preview and send. An existing placeholder's binding MUST be editable afterward (e.g. from the library/usage affordance) to change `alt`/dimensions. Copying the placeholder manually MAY be offered as a secondary convenience.
- **FR-023 (asset vs. placeholder separation)**: The model MUST separate the physical asset (the stored file, with storage key, public URL, original filename, server-verified content type, size, decoded dimensions, tenant scope, uploader) from the logical placeholder/binding (which template uses which asset under which `placeholder_key`, with per-use `alt`/width/height). The friendly `placeholder_key` MUST be unique within its tenant scope so `{{image:key}}` resolves unambiguously.
- **FR-024 (placeholder resolution)**: At preview and at send, the system MUST resolve every `{{image:placeholder_key}}` to a real `<img>` whose `src` is the asset's stable URL (plus `alt` and, when present, width/height), via a resolver pass **distinct** from the Handlebars data-variable engine. Image placeholders MUST NOT be treated as data variables (not extracted into the variable set, not subject to the missing-variable warning). The stored body retains the placeholder form (it never contains literal `<img>`, per FR-005a); the resolved `<img>` is produced only at render time. Because save validates placeholders against existing in-scope assets (FR-005a) and a bound asset cannot be deleted (FR-026), a saved template's placeholders normally always resolve; should an asset nonetheless be unavailable at render, the placeholder MUST render as an explicit broken-image indication and MUST NOT be emitted as literal `{{image:key}}` text to the recipient.
- **FR-025 (usage traceability)**: The system MUST track where each asset is used (which templates reference it via which placeholders), to enable reuse and to drive safe deletion.
- **FR-026 (safe, explicit deletion with informed consent)** — *final rule; supersedes the earlier "retain-forever-for-ever-sent" model*: Deletion is governed by **template usage**, with **informed consent** for the historical-email risk:
  - **In use (bound to ≥1 template)**: deletion MUST be **blocked**. The UI MUST clearly state (a) that the image is still in use, (b) **exactly which templates** use it, and (c) that it must be removed from those templates before it can be deleted. An in-use (bound) image MUST NEVER be deleted silently.
  - **Unbound (no template references it)**: deletion MAY proceed as a **real purge** (the stored object is removed from storage and the asset record deleted), but ONLY after a **mandatory confirmation modal** (see below). There is no "logical-only / retain forever" path anymore.
  - **`ever_sent` no longer blocks deletion** — it only **selects the warning copy**: if the asset was ever included in a sent email, the confirmation modal MUST warn that previously delivered emails may stop displaying the image correctly after deletion.
- **FR-026a (mandatory confirmation modal)**: Before purging an unbound asset, the UI MUST present a blocking confirmation modal. Approved copy:
  - **Title**: `Delete image?`
  - **Message**: `This image is no longer used in any template, so it can be deleted. However, if this image was already included in emails that have been sent, those emails may no longer display the image correctly after deletion.`
  - (Acceptable directer variant: `This image is not currently used in any template. If you delete it, future templates will no longer be able to use it, and previously sent emails that reference this image may stop displaying it correctly.`)
  Deletion proceeds only on explicit confirm; cancel aborts with no change. **The consent is enforced server-side**: the delete operation MUST require an explicit confirmation flag and MUST refuse an unconfirmed purge — so the acknowledgement is inescapable even outside the UI, not merely a client-side modal.
- **FR-027 (sanitization compatibility & image governance)**: Images are governed by stage. At **save**, literal `<img>` is forbidden entirely (FR-005a) — the only image representation is the `{{image:key}}` placeholder, which is bound to an asset (so every image is traceable). At **render** (preview/send), the resolver replaces placeholders with `<img>` whose `src` is the trusted email-assets host; the render-stage sanitizer permits exactly those trusted `<img>` elements (with `alt`, width/height, email-safe inline styles) while rejecting any `<img>` whose `src` is not on the trusted host and all active/dangerous content. Because no literal `<img>` can be saved, there is no manual `<img src>` bypass (external or same-host); the managed library is the only path that produces images.

### Key Entities *(include if feature involves data)*

- **Notification Template**: A per-tenant-or-platform-default record keyed by template code + channel, holding the email subject, the HTML body (source of truth authored by the operator), a derived plain-text representation, the set of variables referenced, active flag, and an immutable notification classification for protected codes. Body is the primary thing changed by this feature.
- **Notification**: A single queued/sent message instance for a recipient, carrying the resolved variable values (payload), delivery status, retry state, and provider identifiers. Subject of the queue-robustness requirements.
- **Audit Record**: A trail entry for template changes; this feature extends it to carry before/after body content.
- **Delivery Job**: The async unit of work that renders and sends a notification; subject of idempotency, retry, dead-letter, and visibility requirements.
- **Email Image Asset** (physical asset): A stored image file in the dedicated email-assets bucket. Attributes: id, tenant scope (tenant id, or platform-level for platform-default templates), uploader, storage key, stable public URL (or coherent equivalent), original filename, **server-verified** content type, size, **decoded** dimensions (width/height), upload status (pending/uploaded/verified/upload-failed), friendly `placeholder_key` (tenant-unique), an **ever-sent marker** (whether the asset has ever been resolved into a delivered email — used only to **select the deletion-warning copy**, NOT to block or defer deletion), created-at. (No retention/soft-delete-only path: an unbound asset is purged on confirmed deletion.) This is the reusable library entry.
- **Template Image Binding** (logical usage): A record that a given Notification Template uses a given Email Image Asset via a `placeholder_key`. Attributes: id, template reference, asset reference, placeholder key (snapshot), alt text, width, height, created-at. Bindings provide reuse and "where is this image used" traceability and drive safe deletion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can author an HTML email template with at least one dynamic variable and see a correctly rendered preview (HTML visually rendered, variables substituted) without any developer involvement.
- **SC-002**: A real test send of a raw-HTML template arrives at a test inbox with the HTML rendered, variables resolved to real values, and a non-empty plain-text alternative present — demonstrated end-to-end at least once before sign-off.
- **SC-003**: 100% of sent emails include both an HTML part and a plain-text part.
- **SC-004**: Authored HTML containing `<script>`, `on*=` handlers, or `javascript:` URLs is rejected at save with a clear error in 100% of tested cases; and for any content that does render/send, those constructs are absent from both the in-app preview and the delivered email.
- **SC-005**: Saving allowlist-conformant HTML and reopening the template returns byte-identical body content (no implicit transformation), verified for representative templates.
- **SC-006**: Every template create/update produces an audit record containing both the prior and new body content.
- **SC-007**: Under an at-least-once enqueue test (the same Notification row enqueued twice), the recipient receives exactly one email in 100% of trials.
- **SC-008**: A transient-failure test shows retries following one predictable backoff policy up to the defined maximum, after which the Notification shows terminal `FAILED` with the final error detail in the existing listing (no silent drop) in 100% of trials.
- **SC-009**: A stalled-job test shows the job reclaimed and processed within the defined visibility window (5 minutes) in 100% of trials.
- **SC-010**: A written queue assessment (current behavior, gaps, target, and what changed) is produced and reviewed.
- **SC-011**: A test-send addressed to a recipient not on the configured allowlist is refused in 100% of trials (no email leaves to a non-allowlisted address in the shared environment).
- **SC-012**: When sample rendering fails or a sample value is missing, the preview shows an explicit error or a labelled placeholder (never a blank/crashed preview) in 100% of tested cases.
- **SC-013**: For identical helper inputs, the previewed render equals the delivered render (locale/timezone consistency) in 100% of tested cases.
- **SC-014**: An operator can upload an image, insert it (producing a `{{image:key}}` placeholder automatically), preview it as a real rendered image, and reuse it in a second template — without hand-writing any `<img>` tag or pasting a URL.
- **SC-015**: A sent email with image placeholders arrives with each image rendered via a stable URL reachable without authentication, in 100% of tested cases.
- **SC-016**: Uploading a disallowed file — including an active/non-image file disguised with an image MIME — is rejected by content-based verification in 100% of trials; no disallowed asset becomes a usable/served image.
- **SC-017**: Attempting to delete a template-bound image is blocked with the list of templates using it in 100% of trials (never silent); deleting an unbound image requires the mandatory modal in the UI **and** an explicit confirmation flag the backend enforces (an unconfirmed delete is refused in 100% of trials), after which the stored object is really purged.
- **SC-022**: For an unbound image that was ever sent, the confirmation modal shows the historical-email warning before purge in 100% of trials (informed consent); for a never-sent unbound image it shows the plain confirmation.
- **SC-018**: An unresolved `{{image:key}}` is never delivered to a recipient as literal placeholder text (it renders as a real image or an explicit broken-image indication) in 100% of tested cases.
- **SC-019**: Any literal `<img>` in the authored body (external or same-host) is rejected at save in 100% of trials, and a `{{image:key}}` referencing no existing in-scope asset is also rejected — so no untraceable image and no orphan placeholder is ever persisted or sent.
- **SC-021**: Uploading an image larger than 5 MB is rejected (at presign by declared size and on confirm by actual size) in 100% of trials.
- **SC-020**: An operator can set and later edit an image's `alt` text (and dimensions) for a given use, and those values appear in both preview and the delivered email.

## Assumptions

- The canonical variable syntax remains Handlebars `{{variableName}}` with the existing helper set; the variable **catalog** and the **set of notification events** are unchanged (explicit non-goals).
- The HTML body field already exists in the data model and remains the source of truth; the plain-text field continues to exist but is **system-derived**, not operator-authored.
- The work proceeds in a **shared** environment (shared database and email provider with the wider system); QA validates real sends to a **safe test inbox**. Recipient safety is enforced by a configured test-send recipient allowlist (FR-012a), not merely by convention.
- "Market-standard queue robustness" is satisfied by: idempotent processing, a single bounded retry-with-backoff policy, an explicit dead-letter path, and a defined visibility/expiry for stuck jobs — implemented within the existing job system rather than introducing a new broker.
- Operators authoring HTML are trusted internal/agency roles (AM/OP/CL_ADMIN); the email allowlist is enforced as save-time validation (reject) plus preview/send sanitization, complementing — not replacing — that trust boundary. The web authoring surface remains AM/OP as today (CL_ADMIN web access is out of scope).
- No WYSIWYG/drag-and-drop builder and no MJML are introduced; the editor is a raw-HTML text editor with variable insertion, image-placeholder insertion, and rendered preview.
- **Image serving uses a dedicated public bucket with stable public URLs** (default), mirroring the existing public `tenant-branding` bucket. Rationale: email clients fetch images without cookies/auth and emails may be opened far in the future, so time-limited signed URLs would yield broken images; tenant-scoped paths with a non-guessable asset id mitigate enumeration. (Open to revisiting if a private-bucket + long-lived-URL strategy is mandated, but that is not the default here.)
- **Deletion = usage-gated + informed consent** (final rule): an asset bound to any template cannot be deleted (UI shows which templates; never silent). An unbound asset can be **really purged** (object removed) but only after a mandatory confirmation modal. There is **no retain-forever path** — the `ever_sent` marker no longer blocks deletion; it only selects the modal's warning copy. **Trade-off accepted by the product owner**: purging an asset that was used in already-sent emails can break the image in those historical emails (the modal warns about this).
- **Image validation is content-based, not MIME-only**: the bucket is public, so the security boundary is server-side byte sniffing + image decode on confirm, with the served `Content-Type` set from the verified type. Allowed content: `png`, `jpeg/jpg`, `webp`, optionally `gif`; `svg` and executable/ambiguous/non-image files are blocked (svg is an active-content/XSS vector). The per-file maximum size is **5 MB** (aligned with the existing inspector-avatar bucket; email images should be modest for deliverability).
- **Images enter only through the managed library**: a saved body contains no literal `<img>` at all — images are expressed only as `{{image:key}}` placeholders bound to assets, and save validates each placeholder resolves to a real in-scope asset. This closes both the external-URL and same-host manual-`<img>` bypasses and makes the library's reuse/traceability/safe-deletion guarantees hold end-to-end.
- **Existing infrastructure is reused**: Supabase Storage, the existing storage port + presign/confirm pattern, the existing bucket-provisioning mechanism, and existing web upload/modal components are reused rather than reinvented.
- The friendly `placeholder_key` is tenant-unique and `{{image:key}}` resolution is a dedicated pass independent of the Handlebars data-variable engine, so the two placeholder forms never collide.
- Image dimensions (width/height) are captured when available and used as `<img>` attributes for layout stability; alt text defaults sensibly (e.g. from the friendly key/filename) and is editable per binding.

## Out of Scope (Non-Goals)

- A WYSIWYG or block/drag-and-drop email builder. (The image library inserts placeholders into raw HTML; it is not a visual layout builder.)
- MJML or any templating DSL beyond the existing Handlebars variables and the `{{image:key}}` image placeholder.
- Image editing/transformation (cropping, resizing, filters) — only upload/store/insert/reuse/delete is in scope.
- A general-purpose digital-asset manager beyond email template images.
- Changing which notification events exist, or the catalog of available variables.
- Changing the RBAC matrix for template management.
- Replacing the underlying job/queue technology with a different broker.
