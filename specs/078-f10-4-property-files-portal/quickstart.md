# Quickstart: Portal property issue

## What this delivers

A rental tenant, holding only a portal link, can report a property problem (description + up to 5 photos) before confirming the inspection. The report shows up for the operation/agency through the existing F10-1/F10-2 surfaces.

## Flow (happy path)

1. Tenant opens `/{portal link}`; the "Report a problem with the property" section renders above the confirm control.
2. For each photo: `POST …/property-issues/presign` → client PUTs the file to the returned `uploadUrl` → `POST …/property-issues/confirm-upload` (with `Idempotency-Key`). Per-photo progress; a failure doesn't lose the others.
3. Tenant writes a description and taps "Submit report": `POST …/property-issues` (with `Idempotency-Key`, the confirmed `photoFileIds`). The issue is created `source=RENTAL_TENANT_PORTAL` and photos are atomically linked.
4. The tenant's own submitted reports appear via `GET …/property-issues` (metadata only).

## Local verification

```bash
# From the worktree root
pnpm --filter @properfy/shared build          # portal schemas available to backend/web
pnpm generate:api                              # regenerate openapi.json + api-types.ts after routes land
pnpm --filter backend test                     # unit + route integration (stubbed storage)
pnpm --filter backend test:integration:db      # real-DB cross-token/cross-tenant isolation proof
pnpm --filter web test                         # portal component tests
pnpm --filter web test:e2e                     # hermetic Playwright (stubbed API)
pnpm --filter backend typecheck && pnpm --filter backend lint
pnpm --filter web typecheck && pnpm --filter web lint
```

## What the tests assert

- **Unit**: token→scope resolution; MIME rejected (not in `issueImageMimes`); size/magic-byte rejection with clear message (C.A5); storage-key ↔ row grammar check; create-issue caps photos at `min(5, maxPhotosPerIssue)`; `createdByUserId=null`, `source=RENTAL_TENANT_PORTAL`; rate-limit key = hashed token.
- **Route integration (supertest, stubbed storage)**: presign→confirm→create happy path; per-token presign limit 12/hour → 13th 429; cross-token access to another appointment's file/issue → 404; read-only token refuses writes; list returns only own-appointment portal issues with the privacy-reduced DTO.
- **Real-DB (testcontainers)**: two agencies coexist; a token for appointment A can neither read nor create issues for appointment B; the created portal issue carries the correct `tenant_id`.
- **Portal E2E (Playwright, hermetic)**: submit a report with 2 photos → the creation call fires (stubbed); the report appears in the read-only list.
