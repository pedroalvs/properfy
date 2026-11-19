# Implementation Plan: Legacy Permanent Re-Geocoding

**Branch**: `044-x02-2-legacy-regeocode` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/044-x02-2-legacy-regeocode/spec.md`
**Source task**: `fase2-etapa1/tarefas/X02-tarefas.md` → TASK-X02-2 (PR2)

## Summary

Deliver a single backend CLI maintenance script, `apps/backend/src/scripts/regeocode-permanent.ts`, that brings legacy stored coordinates into Mapbox terms-of-service compliance. It re-geocodes legacy properties and branches in permanent mode, detects and restores the false-`MANUAL` rows left by the (now-fixed) bug using the audit trail, strips temporary coordinates out of committed import previews, and offers a bulk resume for account-blocked properties. It is **dry-run by default**, throttled, idempotent via the `geocoded_permanently_at` marker, resumable, and every coordinate write is a compare-and-set (on `updated_at`) that also keeps the PostGIS `coordinates` column consistent. No migration (the TASK-X02-1 columns already exist). The PR ships the script + repository methods + unit and DB-integration tests + a runbook; **execution against real data is a separate, human-run OPS step gated on TASK-X02-1 being in production** and is not part of this PR.

## Technical Context

**Language/Version**: TypeScript 5.6 strict, ES2022 ESM; Node.js 24; run via `tsx`.
**Primary Dependencies**: Prisma 6 (`$transaction`, `$queryRaw`, `$executeRaw`), pg-boss 9 (`sendJob`/`stopQueue`), TASK-X02-1's `IGeocodingService` + `DynamicGeocodingService.isConfigured()` + `MapboxPermanentGeocodingUnavailableError` + `formatGeocodingQuery`, `IntegrationConfigResolver` + `PrismaIntegrationSettingRepository`, `AuditService`.
**Storage**: PostgreSQL (Supabase) with PostGIS; `properties` (`lat/lng Decimal(10,7)` mirrored to `coordinates GEOMETRY(Point,4326)`, `geocoded_permanently_at`, `geocoding_failure_code`), `branches` (`address_json` + `geocoded_permanently_at`), `appointment_imports` (`preview_json`), `audit_logs`.
**Testing**: Vitest unit (`src/scripts/regeocode-permanent.test.ts`, fakes for repo/geocoder/enqueue/sleep); testcontainers DB integration (`tests/integration/db/regeocode-permanent.integration.test.ts`, real Postgres+PostGIS, fake geocoder) — excluded from `pnpm --filter backend test`, run via `test:integration:db`.
**Target Platform**: Node.js CLI, invoked locally or via `fly ssh console` in prod.
**Project Type**: Backend monorepo workspace (`apps/backend`), one-off operational script (not wired into the running server).
**Performance Goals**: Throttle default 120 req/min (one fifth of the v5 600 req/min limit); batches of 100; a prod run may take tens of minutes.
**Constraints**: ~US$ 0.005 per permanent request (no free tier); dry-run must cost nothing; CAS must prevent overwriting concurrent edits; PostGIS must stay consistent; no migration.
**Scale/Scope**: One script file + ~6 new repository methods + 2 test files + 1 runbook + CLAUDE.md update. No route, no schema, no OpenAPI change (so no api-types regeneration). Well under the 150-file PR cap.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Clean Architecture (NON-NEGOTIABLE)** — PASS. New repository methods are declared as ports on `IPropertyRepository` (`domain/`) and implemented in `prisma-property.repository.ts` (`infrastructure/`). The script is an operational entry point that composes the infrastructure wiring (resolver + repo + geocoder + audit + queue) and depends on the domain port and the application-layer `formatGeocodingQuery`; it never embeds SQL outside the repository for coordinate writes (branch jsonb merge lives in the repository too). Coordinate writes go only through the repository, keeping `coordinates` consistent (spec FR-011).
- **II. Multi-Tenant Safety (NON-NEGOTIABLE)** — PASS. This is an `AM`/`OP`/`SYS`-equivalent operator-run maintenance script. It legitimately reads cross-tenant (no tenant pin) as the operational team, and every selection honors `--tenant` when given; every repository write carries `tenant_id` in the CAS `where`. No new cross-tenant platform-scoped entity is introduced (it operates on already tenant-scoped `properties`/`branches`/`appointment_imports`). Audit rows carry the resolved `tenantId` of each affected row with `actorType: 'SYSTEM'`.
- **III. Test-Driven Development (NON-NEGOTIABLE)** — PASS (planned). Red→green→refactor; the spec enumerates 40 unit cases and 9 DB-integration cases up front; integration tests hit a real Postgres+PostGIS and never mock Prisma.
- **IV. Contract-First APIs (NON-NEGOTIABLE)** — PASS / N/A. No HTTP route, no Zod boundary schema and no OpenAPI change (CLI only), so no contract regeneration. The `RegeocodeReport` shape is an internal CLI contract documented in the spec and the contracts file.
- **V. Simplicity and Minimal Impact** — PASS. One script, the minimal repository methods it needs, no speculative abstractions, no change to TASK-X02-1 behavior, the import flow, the sweep or any UI. `noResult` residual violation is an explicitly accepted tradeoff (dec. 5), tracked in Complexity Tracking.
- **Audit (Mandatory on Sensitive Actions)** — PASS. Every `--apply` write emits a `SYSTEM` audit (`property.geocode_permanent_backfilled`, `property.false_manual_restored`, `property.geocode_permanent_no_result`, `branch.geocode_permanent_backfilled`, `property.geocode_retry_requeued`); no audit in dry-run.
- **Knowledge Classification** — the spec labels IMPLEMENTED REALITY (TASK-X02-1 columns/port, `formatGeocodingQuery`, repo `syncCoordinates`) vs APPROVED RULE (the X02-2 decisions dec. 1–18) vs the accepted residual gap (`noResult`).

**Result: PASS. No unjustified gate violations. No Complexity Tracking entries required beyond the accepted `noResult` residual (below).**

## Project Structure

### Documentation (this feature)

```text
specs/044-x02-2-legacy-regeocode/
├── plan.md              # This file
├── spec.md              # Feature spec (already authored)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli-regeocode-permanent.md   # CLI + RegeocodeReport contract
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/backend/
├── src/
│   ├── scripts/
│   │   ├── regeocode-permanent.ts            # NEW — the script (exported fn + isDirectInvocation guard)
│   │   └── regeocode-permanent.test.ts       # NEW — unit tests (fakes)
│   ├── modules/property/
│   │   ├── domain/
│   │   │   └── property.repository.ts        # EDIT — add port methods
│   │   └── infrastructure/
│   │       └── prisma-property.repository.ts # EDIT — implement CAS + jsonb merge + selections
│   └── shared/
│       ├── domain/geocoding-address.ts       # REUSE (TASK-X02-1) formatGeocodingQuery
│       └── infrastructure/queue.ts           # REUSE sendJob / stopQueue
├── tests/integration/db/
│   └── regeocode-permanent.integration.test.ts  # NEW — real Postgres+PostGIS
└── CLAUDE.md                                 # EDIT — document the script + methods + code

docs/runbooks/
└── regeocode-permanent.md                    # NEW — rollout + manual-correction recipe
```

**Structure decision**: Single backend workspace. The script lives in `apps/backend/src/scripts/` next to the `backfill-property-branch.ts` precedent (exported function + `isDirectInvocation`, dry-run default). Repository additions follow the existing port/adapter split so Clean Architecture holds and PostGIS stays consistent through the one `syncCoordinates` path.

## Complexity Tracking

| Item | Why it exists | Simpler alternative rejected because |
|---|---|---|
| `LEGACY_PERMANENT_NO_RESULT` rows keep their temporary coordinate (dec. 5) | A legacy address with no permanent result would otherwise lose its only coordinate; dev accepted the residual terms violation until manual correction | Deleting the coordinate breaks the map/overdue displays for those rows with no replacement; re-paying the failing request every run is wasteful (hence the exclusion filter) |
| CAS on `updated_at` + `syncCoordinates` in one `$transaction` | A prod run takes tens of minutes; a concurrent edit (esp. address-change leaving the old lat on a PENDING row) must not be stamped with a stale coordinate under a permanent marker (silent, permanent damage via the marker) | A plain `update` by id would overwrite concurrent edits; separate update + sync could leave `coordinates` inconsistent on a crash |
| Branch write via `$executeRaw` jsonb merge | `address_json` is client-owned and replaced wholesale by the normal update path; the script must change only `latitude`/`longitude` and never rewrite the address | Reading-then-writing the whole JSON risks clobbering a concurrent address edit; the merge + `updated_at` CAS is atomic |
