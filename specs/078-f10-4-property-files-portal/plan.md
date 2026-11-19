# Implementation Plan: Portal — rental tenant reports a property problem before confirming

**Branch**: `078-f10-4-property-files-portal` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/078-f10-4-property-files-portal/spec.md`

## Summary

Add the portal side of F10: four token-authenticated routes (`presign`, `confirm-upload`, `create issue`, `list issues`) that let a rental tenant report a property problem with photos before confirming the inspection. All data primitives (tables, storage-key grammar, repositories, retention, config) come from the merged TASK-F10-1 and are reused. New portal-specific use cases live in the `rental-tenant-portal` module because the F10-1 use cases require a JWT `AuthContext` that the token flow does not have. Issues are created with `source = RENTAL_TENANT_PORTAL`, `createdByUserId = null`, scoped entirely by the token's appointment. A per-token rate limit (12 presigns/token/hour) protects storage. The OpenAPI contract and typed client are regenerated.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24
**Primary Dependencies**: Fastify 4, Prisma 6, Zod 3, `@fastify/rate-limit`, `file-type` (magic-byte sniff), React 18 + Vite 5 + TanStack Query 5 (portal web), `openapi-fetch`
**Storage**: PostgreSQL (Supabase) — **no schema change, no migration** (reuses `property_files`/`property_issues` from F10-1); Supabase Storage bucket `inspection-assets` (reused)
**Testing**: Vitest (unit), Supertest (route integration), testcontainers (real-DB scoping proof), Playwright (hermetic portal E2E)
**Target Platform**: Fastify API (all envs) + the web portal (Vercel)
**Project Type**: Multi-tenant B2B SaaS monorepo (backend + shared + web)
**Performance Goals**: Standard API latency; one photo uploaded at a time; no bulk operation
**Constraints**: Token-only auth (no JWT); per-token rate limit 12 presigns/hour; cross-token/cross-tenant isolation is NON-NEGOTIABLE; magic-byte + size validation at confirm; `Idempotency-Key` on confirm + create
**Scale/Scope**: ≤ 5 photos per report (`min(PORTAL_MAX_PHOTOS_PER_ISSUE=5, maxPhotosPerIssue)`); low volume per token; 4 new routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How this plan complies |
|---|---|---|
| I. Clean Architecture | PASS | New use cases in `rental-tenant-portal/application`; they depend only on domain ports (`IPropertyFileRepository`, `IPropertyIssueRepository`, `IStorageService`, `IPlatformSettingsReader`, `IIdempotencyService`, `AuditService`) injected via the container. Routes stay thin (parse → call use case → map). No Prisma/Fastify imports in use cases. |
| II. Multi-Tenant Safety | PASS | `PropertyIssue`/`PropertyFile` carry `tenant_id` (D5). Scope is resolved from the token's appointment via `findAppointmentScope` → `{propertyId, tenantId}`; no client-supplied tenant/property/appointment is trusted. Cross-token access returns not-found (C.A2). Audit on create (`property_issue.created`, `actorType: ANONYMOUS`, resolved `tenantId`). Idempotency on confirm + create (D24). A real-DB integration test proves a token cannot reach another appointment/agency. |
| III. TDD | PASS | Red→green per use case: unit tests (scope resolution, MIME/size, rate limit key, cross-token 404), supertest route integration (stubbed storage), one real-DB scoping test, portal Vitest/RTL + hermetic Playwright. |
| IV. Contract-First APIs | PASS | New Zod schemas in `packages/shared/src/schemas/property-files.ts`; routes generate OpenAPI; `pnpm generate:api` regenerates `openapi.json` + `api-types.ts`; frontend consumes the typed client. Error envelope + `/v1` prefix preserved. |
| V. Simplicity & Minimal Impact | PASS | No new table/migration; reuse F10-1 ports and the shared storage-key grammar; no new external dependency; merged F10-1 code untouched. The only duplication is thin portal orchestration, justified by the different actor model. No role-matrix change (token auth, not RBAC). |

**Domain invariant — Appointment state machine**: Not touched. Reporting an issue does **not** transition the appointment; confirming remains the existing separate portal action.

**Complexity Tracking**: No deviations from the constitution. No entry required.

## Project Structure

### Documentation (this feature)

```text
specs/078-f10-4-property-files-portal/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── portal-property-issues.md   # the 4 route contracts
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/src/
├── schemas/property-files.ts          # ADD portal section: portal presign/confirm/create/list schemas + types
├── schemas/property-files.test.ts     # ADD portal schema tests
└── (index.ts already re-exports property-files)

apps/backend/src/modules/rental-tenant-portal/
├── application/use-cases/
│   ├── presign-portal-issue-photo.use-case.ts         # NEW
│   ├── confirm-portal-issue-photo.use-case.ts         # NEW
│   ├── create-portal-issue.use-case.ts                # NEW
│   ├── list-portal-issues.use-case.ts                 # NEW
│   └── __tests__/                                      # NEW unit tests (one per use case)
├── application/portal-issue-mappers.ts                # NEW — portal-safe DTO mappers (no staff identity)
└── interfaces/rental-tenant-portal.routes.ts          # ADD 4 routes + per-token presign rate limit

apps/backend/src/main/container.ts                      # WIRE the 4 use cases into the portal route container
apps/backend/tests/integration/
└── portal-property-issues.integration.test.ts          # NEW supertest (RBAC/token scope, rate limit, MIME, stubbed storage)
apps/backend/tests/integration/db/
└── portal-property-issues.scope.db.test.ts             # NEW real-DB cross-token/cross-tenant isolation proof

apps/web/src/features/rental-tenant-portal/
├── components/PortalReportProblemSection.tsx           # NEW — the "Report a problem" UI
├── components/PortalReportProblemSection.test.tsx      # NEW
├── hooks/usePortalIssues.ts                            # NEW — list + create + photo presign/confirm
├── hooks/usePortalIssues.test.ts                       # NEW (optional; covered by component + E2E)
└── pages/PortalPage.tsx                                # EDIT — render the section before the confirm control

apps/web/tests/e2e/
└── portal-report-problem.spec.ts                       # NEW hermetic Playwright (stubbed API)

packages/shared/openapi.json + packages/shared/src/api-types.ts   # REGENERATED (pnpm generate:api)
```

**CLAUDE.md updates (same PR):** root (Active Technologies / Recent Changes — keep-all append), `apps/backend/CLAUDE.md` (portal routes under the property-files / portal section), `packages/shared/CLAUDE.md` (portal schemas in the property-files bullet), `apps/web/CLAUDE.md` (portal report-problem feature).

## Phase 0: Research → `research.md`

Resolves every design decision (reuse-vs-new use cases, rate-limit mechanism, audit actor, portal DTO shape, no-download-route, no portal-activity log, scope edge cases). No `NEEDS CLARIFICATION` remained after the task's D1–D29 decisions.

## Phase 1: Design & Contracts

- `data-model.md`: reused entities (`PropertyIssue`, `PropertyFile type=ISSUE`), the portal field derivations (source, createdByUserId=null, key grammar), and the read-back DTO projection. No new tables/columns.
- `contracts/portal-property-issues.md`: the four route contracts (method, path, auth, body, response, errors, rate limit).
- `quickstart.md`: how to exercise the flow locally and what the tests assert.
- Agent context update via `.specify/scripts/bash/update-agent-context.sh claude`.

**Post-design Constitution re-check**: still PASS — the design introduces no new table, no cross-tenant read without the token's resolved scope, and keeps authorization in the application layer behind the token middleware.
