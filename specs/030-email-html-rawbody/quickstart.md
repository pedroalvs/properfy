# Phase 1 Quickstart: Validate Raw-HTML Email + Image Library + Queue

Local + shared-env validation. The floor uses a **shared** DB and Resend; test-sends are guarded by a recipient allowlist (FR-012a) — only send to the safe test inbox.

## Prereqs
- `pnpm install` (adds `sanitize-html`, `html-to-text`, `file-type`, `image-size` in `apps/backend`).
- `apps/backend/.env`: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `DATABASE_URL`/`DIRECT_URL`, `PG_BOSS_URL`, Supabase S3 vars, and **new** `EMAIL_TEST_RECIPIENT_ALLOWLIST` (comma-separated safe inbox(es)) + `EMAIL_ASSETS_BUCKET=email-assets` + public URL base.
- `pnpm --filter backend prisma migrate dev` (creates `email_assets`, `template_image_bindings`, `EmailAssetStatus`).
- Provision buckets: run the storage provisioner so the public `email-assets` bucket exists.

## A. Raw-HTML authoring + reject-on-save
1. `pnpm --filter backend dev` + `pnpm --filter web dev`; open `/notification-templates` (AM/OP).
2. Edit a template; type raw HTML with `{{tenantName}}` and a `<table>` → preview renders it (iframe), variables show sample data. **Save → reopen → body byte-identical** (SC-005).
3. Type `<script>alert(1)</script>` (or `<img src=x>`) → **save rejected** with the offending construct named (SC-004, FR-005a). Nothing persisted.
4. Type `{{image:nope}}` (unknown key) → **save rejected** naming the bad key (SC-019/FR-005a).

## B. Image library
1. In the editor, click **Images** → modal opens (Dialog). Upload a PNG (≤5 MB) → presign→PUT→confirm; content-verify passes; it appears with thumbnail + friendly key (SC-014).
2. Upload an `.svg` (or a `.png` that is actually HTML) → **confirm rejects** via content verification; never becomes usable (SC-016).
3. Upload a 6 MB image → rejected at presign/confirm (SC-021).
4. Select the PNG → **Insert** → `{{image:hero_banner}}` appears at the cursor; set `alt` (SC-020). Preview renders the **real image** (SC-014). Insert the same asset into a second template (reuse).
5. Send a test (section D) → recipient sees the image via the public URL (SC-015).
6. Try to **delete** the in-use image → blocked with the list of templates using it (SC-017). Remove the usages, resend nothing → if it was already sent, delete is **logical** and the object is **retained** (open the old test email → image still loads, SC-017).

## C. Queue hardening
1. Force a transient Resend failure (e.g. temporarily bad key) → observe retries on the schedule `15s→45s→2m→5m→15m` (one mechanism; the `retry-poll` cron is gone). After 6 attempts the Notification shows terminal `FAILED` with the final error in `GET /v1/notifications` (SC-008); manual retry re-drives it.
2. Enqueue the same `Notification.id` twice (simulate at-least-once) → exactly one email sent (`singletonKey`, SC-007).
3. Kill the worker mid-job → after the 5-min visibility window the job is reclaimed and processed (SC-009).

## D. Real end-to-end Resend test-send (guarded)
1. `POST /v1/notification-templates/{code}/EMAIL/test-send` with `recipientEmail` = an allowlisted test inbox → arrives with HTML rendered, variables resolved, images shown, and a non-empty **text** part (SC-002/SC-003/SC-015).
2. `recipientEmail` = a non-allowlisted address → `403 RECIPIENT_NOT_ALLOWED`; nothing sent (SC-011).

## E. Automated tests (TDD)
- `pnpm --filter backend test` — unit (sanitizer save/render profiles, html-to-text, image-content-verifier, placeholder resolver, queue policy, delete-asset retention) + Supertest integration (template upsert reject paths, presign/confirm, delete in-use/orphan/ever-sent) on a real DB.
- `pnpm --filter web test` / Playwright — editor save-reject, image modal upload/insert/delete-blocked, preview renders.
- `pnpm lint && pnpm typecheck && pnpm test` all green; notifications coverage ≥ 80%.
