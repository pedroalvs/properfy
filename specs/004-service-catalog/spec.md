# Feature Specification: Service Catalog

**Feature Branch**: `004-service-catalog`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED (Phase 1) — pending review for Phase 2/3 gaps
**Sources**:
- Code: `apps/backend/src/modules/{service-type,service-region,pricing-rule}/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/schemas/{service-type,service-region,pricing-rule}.ts`, `apps/web/src/features/service-types/**`, `apps/web/src/features/tenants/components/PricingRulesSection.tsx`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `apps/backend/CLAUDE.md`, `projeto-consolidado/modelo-dados-executavel.md`, `projeto-consolidado/regras-negocio-respostas-cliente.md`
- Legacy spec: **none** — this feature is reverse-engineered from code only; no `specs/backend/service-*.spec.md` exists.

> **Scope clarification.** This feature owns three related concerns that make up the pricing and geographic catalog of the platform:
>
> 1. **Service Type** — global catalog of service offerings (`ROUTINE`, `INGOING`, `OUTGOING` inspection flows). No `tenant_id`: a single platform-wide list curated by Admin Master. Controls whether a given service requires tenant (property renter) confirmation.
> 2. **Service Region** — **tenant-scoped** list of geographic polygons defining the areas where a specific agency offers inspection services, used by the inspector marketplace to match appointments to inspectors whose `InspectorRegion` mappings cover the target area. Carries a GeoJSON polygon and a presentation color.
> 3. **Pricing Rule** (`ServicePriceRule`) — tenant-scoped (and optionally branch-scoped) pricing for a given service type: `priceAmount` charged to the tenant and `payoutType`+`payoutValue` paid to the inspector, plus an opaque `bonusRuleJson` for per-rule bonus logic.
>
> These three concerns are split across three backend modules but share a lifecycle and are consumed together by appointments, the marketplace, and billing. Migrating them as one spec-kit feature keeps the cross-references readable.
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status: `IMPLEMENTED` | `APPROVED` | `GAP`. Source: `code` | `dossier` | `inferred`.

## User Scenarios & Testing

### User Story 1 — Curate the platform-wide service type catalog

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Admin Master creates, lists, reads, and updates service types. Each type has a globally unique `code` (uppercased, 1..50 chars), a display `name`, a `flowType` (`ROUTINE | INGOING | OUTGOING`), and a `requiresTenantConfirmation` flag that drives appointment-side behavior (feature 006). Service types can be activated or deactivated via the `status` field on update; they are never hard-deleted.

**Why this priority**: Appointments, pricing rules, and service groups all reference `service_type_id`. Without at least one active service type, no scheduling work can begin.

**Independent Test**: As AM, `POST /v1/service-types` with a unique `code`, confirm it appears in the list, patch its `name` and `status`, confirm changes persist and are audited.

**Acceptance Scenarios**:

1. **Given** an AM actor, **When** they submit `POST /v1/service-types` with a valid payload, **Then** a service type is created with `status = ACTIVE`, the `code` is stored uppercased, and an audit record is written.
2. **Given** a `code` already in use, **When** AM attempts to create another, **Then** the request fails with `SERVICE_TYPE_CODE_CONFLICT`.
3. **Given** a non-AM actor, **When** they call create, **Then** the request is rejected with `FORBIDDEN`.
4. **Given** any authorized actor, **When** they call `GET /v1/service-types` or `GET /v1/service-types/:id`, **Then** results are paginated/returned with `flowType`, `requiresTenantConfirmation`, and `status` fields.
5. **Given** an AM actor, **When** they `PATCH` a service type with new `name`, `flowType`, `requiresTenantConfirmation`, or `status`, **Then** fields persist and the update is audited with `before`/`after` snapshots.
6. **Given** any non-AM actor, **When** they call PATCH, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 2 — Draw and manage inspector service regions

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Operators (AM, OP) define tenant-scoped geographic polygons (via GeoJSON) representing the areas where a specific agency offers inspection services. AM can manage regions for any tenant; OP manages regions within their own tenant. Regions have a name, polygon, and presentation color. They can be deactivated (with reason) and then deleted, in two steps -- active regions cannot be deleted. Regions are referenced by the inspector-region join table (feature handled in inspector domain) and by service groups (feature 005).

> **CORRECTION (2026-04-06)**: The original spec described service regions as a global (platform-wide) entity. The dossier and business rules establish that regions are **tenant-scoped** -- each agency defines its own service areas. The current codebase stores regions without `tenant_id`, which is a DIVERGENCE that must be corrected. See `data-model.md` for the required schema change.

**Why this priority**: The marketplace offer flow (feature 005) uses region membership to decide which inspectors see which appointments. Without at least one active region, the marketplace cannot match inspectors.

**Independent Test**: As AM, create a region with a valid polygon, list it, patch its color, deactivate with a reason, attempt delete → expect success (since inactive); attempt delete on an active one → expect `SERVICE_REGION_STILL_ACTIVE`.

**Acceptance Scenarios**:

1. **Given** an AM (any tenant) or OP (own tenant only), **When** they `POST /v1/service-regions` with a valid GeoJSON `Polygon` and `tenantId`, **Then** a region is created with `status = ACTIVE`, default color `#3b82f6` if omitted, `createdByUserId` captured, and an audit record is written. OP's `tenantId` is derived from JWT.
2. **Given** any non-AM/OP actor, **When** they call create, **Then** the request is rejected with `FORBIDDEN`.
3. **Given** any authorized actor, **When** they `GET /v1/service-regions`, **Then** results are paginated with `status` and `search` filters.
4. **Given** an AM or OP, **When** they `PATCH /v1/service-regions/:id`, **Then** name/polygon/color/status updates persist and are audited.
5. **Given** an active region, **When** AM or OP calls `POST /v1/service-regions/:id/deactivate` with a `reason`, **Then** `status` flips to `INACTIVE` and the reason is persisted on the audit record.
6. **Given** an inactive region, **When** AM or OP calls `DELETE /v1/service-regions/:id`, **Then** the region row is hard-deleted (after cascade of inspector_regions FK). If the region is still `ACTIVE`, the request fails with `SERVICE_REGION_STILL_ACTIVE`. (`IMPLEMENTED (implementation decision)` — the dossiê favors deactivation/controlled retirement over hard delete; hard delete with cascade is not a dossiê-mandated behavior. See FR-014.)
7. **Given** an AM or OP, **When** they call `POST /v1/service-regions/resolve` with up to 200 appointment IDs, **Then** the response lists matching regions with `matchedAppointmentCount`, `inspectorCount`, and the array of unmatched appointment IDs.

---

### User Story 3 — Define per-tenant and per-branch pricing rules

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An operator (AM, OP) or agency admin (CL_ADMIN) defines a pricing rule for a service type within a tenant. Rules may be tenant-wide (`branchId = null`) or branch-specific. The platform resolves pricing at appointment time by preferring a branch-level rule over a tenant-level fallback via `resolvePricingRule`. Each rule specifies:

- `priceAmount` — amount charged to the tenant, in the tenant's currency.
- `payoutType` — `FIXED` (flat amount) or `PERCENTAGE` (of `priceAmount`).
- `payoutValue` — the numeric value matching the `payoutType`.
- `bonusRuleJson` — opaque per-rule bonus logic (shape not enforced; tracked as GAP-003).

Only one rule is allowed per `(tenant_id, service_type_id, branch_id)` triple. Rules cannot be hard-deleted; they are deactivated via `status = INACTIVE`.

**Independent Test**: As CL_ADMIN, create a tenant-level rule for a service type → create a branch-level rule for the same service type → call an internal resolution helper for that branch → expect the branch-level rule to win. Attempt to create a duplicate → expect `PRICING_RULE_DUPLICATE`.

**Acceptance Scenarios**:

1. **Given** an AM, **When** they submit `POST /v1/pricing-rules` with `tenantId`, **Then** the rule is created under that tenant. OP creates pricing rules within their own tenant only (tenant derived from JWT).
2. **Given** a CL_ADMIN, **When** they submit without `tenantId`, **Then** the tenant is derived from JWT and the rule is created under their own tenant. If they attempt to pass a different `tenantId`, it is ignored.
3. **Given** a duplicate `(tenant_id, service_type_id, branch_id)` triple, **When** create is attempted, **Then** the request fails with `PRICING_RULE_DUPLICATE`.
4. **Given** a `serviceTypeId` that does not exist, **When** create is attempted, **Then** the request fails with `SERVICE_TYPE_NOT_FOUND`.
5. **Given** a `branchId` that does not belong to the resolved tenant, **When** create is attempted, **Then** the request fails with `BRANCH_NOT_FOUND`.
6. **Given** any authorized actor, **When** they `GET /v1/pricing-rules` with filters (`tenantId`, `serviceTypeId`, `branchId`, `status`), **Then** results are paginated.
7. **Given** AM, OP, or CL_ADMIN (own tenant), **When** they `PATCH /v1/pricing-rules/:id`, **Then** the rule is updated with audit trail; CL_ADMIN cannot cross tenant boundaries.
8. **Given** a lookup for pricing on an appointment with `branchId`, **When** `resolvePricingRule` runs, **Then** an active branch-level rule wins; if none exists, an active tenant-level (`branchId = null`) rule is returned; otherwise null.

---

### Edge Cases

- **Service type `code` canonicalization**: Zod schema uppercases on input. Lookups by code assume callers send any case.
- **`requiresTenantConfirmation` default mismatch**: Zod schema defaults to `true`, but `CreateServiceTypeUseCase` falls back to `false` if the property is absent from the input object (`requiresTenantConfirmation ?? false`). When the HTTP route runs, Zod populates the field so the use case sees `true` unless explicitly overridden. Tests or direct use-case calls that bypass the schema will silently get `false`. This is a latent inconsistency tracked as **GAP-001**.
- **Service type status only**: there is no delete endpoint. Deactivation is via PATCH with `status: INACTIVE`. The column is not `deleted_at`-style; history is implied by `updated_at` only.
- **Pricing rule currency**: `priceAmount` and `payoutValue` are stored without a currency field; the currency is implied by the parent tenant (feature 002). Changing a tenant's currency does not rewrite existing rules — this is a known limitation tracked as **GAP-002**.
- **Pricing rule uniqueness with NULL branch**: Postgres allows multiple NULLs in a unique constraint by default. The application layer's duplicate check uses `findByUnique(tenantId, serviceTypeId, branchId)` which explicitly matches `IS NULL` — verify the repository implementation matches this contract (GAP-005).
- **Region deactivation with dangling mappings**: deactivating a region does not cascade to `inspector_regions`; the inspector keeps the mapping but sees no work until the region is reactivated or deleted. Delete cascades the join rows.
- **Resolve regions limit**: `resolveRegionsSchema` caps `appointmentIds` at 200 entries per request (raised from 25 after PostGIS landed via GAP-004).
- **Geographic matching currently uses in-memory GeoJSON**: the `geom` PostGIS column on `service_regions` is declared via `Unsupported(...)` and is not populated by application code. The resolver works but cannot take advantage of spatial indexes at scale (GAP-004).

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted.

#### Service Type

- **FR-001**: System MUST expose a global service type catalog with unique `code` (uppercased on write).
- **FR-002**: System MUST restrict service type create and update to Admin Master (AM) only.
- **FR-003**: System MUST allow any authenticated user to list and read service types (no RBAC gate on reads).
- **FR-004**: System MUST persist `flowType` (`ROUTINE | INGOING | OUTGOING`) and `requiresTenantConfirmation` on every service type; these drive appointment behavior in feature 006.
- **FR-005**: System MUST NOT expose a hard-delete path for service types; deactivation is via `status = INACTIVE`.
- **FR-006**: System MUST audit `service_type.created` and `service_type.updated` with `before`/`after` snapshots.

#### Service Region

- **FR-010** (`Status: APPROVED RULE — code diverges (CORRECTION-004 pending)`): System MUST store service regions with a **mandatory `tenant_id`**, GeoJSON `Polygon`, display `color`, `status`, and `createdByUserId`. Region names are unique only within the same tenant. The code currently stores regions WITHOUT `tenant_id` — this is a known divergence to correct.
- **FR-011**: System MUST restrict service region create, update, deactivate, delete, and resolve to AM (any tenant) or OP (own tenant only).
- **FR-012**: System MUST require a `reason` on deactivation and persist it on the audit record (`service_region.deactivated`).
- **FR-013**: System MUST refuse to delete active regions (`SERVICE_REGION_STILL_ACTIVE`). Deletion is only allowed on `INACTIVE` rows.
- **FR-014** (`implementation decision — dossiê favors deactivation/controlled, not hard delete with cascade`): System MUST cascade-delete `inspector_regions` rows when a region is deleted (enforced by the Prisma `onDelete: Cascade`).
- **FR-015**: System MUST provide `POST /v1/service-regions/resolve` accepting up to 200 appointment IDs and returning matched regions with inspector counts and the list of unmatched appointment IDs. Region matching MUST be scoped by the appointment's `tenant_id` once CORRECTION-004 lands.
- **FR-016**: System MUST audit `service_region.created`, `service_region.updated`, `service_region.deactivated`, and `service_region.deleted`.

#### Pricing Rule

- **FR-020**: System MUST enforce unique `(tenant_id, service_type_id, branch_id)` per pricing rule, treating `branch_id = NULL` as the tenant-wide fallback.
- **FR-021**: System MUST resolve pricing at appointment time by preferring the active branch-level rule over the active tenant-level fallback (`resolvePricingRule` domain function).
- **FR-022**: System MUST restrict pricing rule create and update to AM, OP, and CL_ADMIN (own tenant). Client users (`CL_USER`) and inspectors (`INSP`) are forbidden.
- **FR-023**: System MUST derive `tenantId` from JWT for OP and CL_ADMIN; AM must supply `tenantId` in the payload.
- **FR-024**: System MUST persist `payoutType` (`FIXED | PERCENTAGE`) and `payoutValue` per rule; the consumer (feature 010-billing) interprets `payoutValue` according to the type.
- **FR-025**: System MUST NOT hard-delete pricing rules; deactivation is via `status = INACTIVE`.
- **FR-026**: System MUST audit `pricing_rule.created` and `pricing_rule.updated` with `tenantId` on every entry.
- **FR-027**: System MUST reject pricing rules referencing a `serviceTypeId` that does not exist in the catalog (`SERVICE_TYPE_NOT_FOUND`).
- **FR-028**: System MUST reject pricing rules referencing a `branchId` that does not belong to the resolved tenant (`BRANCH_NOT_FOUND`).

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Service type and pricing rule endpoints SHOULD respond within 300 ms p95.
- **NFR-002** (`Status: APPROVED, Source: inferred`): Region resolution SHOULD complete within 500 ms for 25 appointments — above that, spatial indexes become mandatory (tracked as GAP-004).
- **NFR-003** (`Status: IMPLEMENTED, Source: code`): All list endpoints paginate; unbounded lists are forbidden.

### Key Entities

- **ServiceType** — global row; `id`, `code` (unique), `name`, `flowType`, `requiresTenantConfirmation`, `status`, timestamps. No `tenant_id`.
- **ServiceRegion** — tenant-scoped row; `id`, `tenant_id`, `name`, `geojson`, `geom` (PostGIS, unused — GAP-004), `color`, `status`, `createdByUserId`, timestamps. Join table `InspectorRegion(inspector_id, region_id)`.
- **ServicePriceRule** (pricing rule) — tenant-scoped; `id`, `tenant_id`, `service_type_id`, `branch_id?`, `price_amount`, `payout_type`, `payout_value`, `bonus_rule_json?`, `status`, timestamps. Unique on `(tenant_id, service_type_id, branch_id)`.
- **Domain function**: `resolvePricingRule(rules, branchId)` — chooses the correct rule for an appointment.

Full schema and invariants in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: Every service type and pricing rule write produces exactly one audit record. Service region create/update/deactivate/delete each produce one audit record; `deactivate` includes the supplied reason.
- **SC-002**: Pricing resolution for an appointment with a branch returns the branch-level rule when present; otherwise the tenant-level fallback; otherwise null — asserted by unit tests of `resolvePricingRule`.
- **SC-003**: Deleting an active service region is always blocked; deleting an inactive region cascades `inspector_regions` entries.
- **SC-004**: The resolve-regions endpoint returns `unmatchedAppointmentIds` for any appointment not covered by any region — asserted by integration tests.
- **SC-005**: Creating a pricing rule with a non-existent `serviceTypeId` or foreign `branchId` always fails; covered by unit tests.
- **SC-006**: CL_ADMIN cannot bypass tenant scoping on pricing rules regardless of payload — asserted by integration tests.
- **SC-007**: `requiresTenantConfirmation` defaults to `true` when the HTTP route is used (Zod default wins) — asserted by integration tests.

## Assumptions

- Service types are platform-wide because the operational team controls the menu of offered inspections. A tenant-specific catalog is not required for Phase 1.
- ~~Service regions are platform-wide because inspectors are contracted across tenants.~~ **CORRECTED**: Service regions are tenant-scoped -- each agency defines its own service areas. See CORRECTION note in User Story 2.
- Pricing is tenant+branch scoped because different agencies and branches negotiate different rates.
- The GeoJSON polygon shape is sufficient for Phase 1; multi-polygon regions would require schema changes (GAP-006).
- `bonus_rule_json` is consumed only by feature 010-billing; this feature stores it opaquely.
- Pricing is always expressed in the tenant's configured currency (feature 002). Multi-currency rules are out of scope.
- The `resolve` endpoint exists for the web portal's appointment-batching UX, not as a general-purpose geocoding service.

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | `requiresTenantConfirmation` default drift | ~~Zod defaults `true`, use case defaults `false`.~~ **IMPLEMENTED** (Wave 1). | Use case input now required (not optional). `?? false` fallback removed. 1 regression test. |
| GAP-002 | Pricing rule currency decoupling | ~~Silent repricing on currency change.~~ **IMPLEMENTED** (Wave 3). | `currency` column on `service_price_rules`. Frozen from tenant at creation. Migration backfills from tenant. Use cases read from entity, not tenant. 2 new tests. |
| GAP-003 | `bonus_rule_json` schema contract | ~~Opaque JSON.~~ **IMPLEMENTED** (Wave 3). | `bonusRuleSchema` in shared: 4 types (VOLUME_TIER, SERVICE_TYPE_BONUS, DAY_OF_WEEK, FLAT_BONUS), typed fields, `.passthrough()`. Replaces `z.record(z.unknown())`. `BonusRule` type. 15 schema tests. |
| GAP-004 | PostGIS `geom` column unused on regions | ~~Never populated.~~ **IMPLEMENTED** (Wave 2). | `syncGeom()` on create/update via `ST_GeomFromGeoJSON`. GIST index. Resolver rewritten to `ST_Intersects`. `findContainingPoint()` added. Backfill migration. 10 tests. |
| GAP-005 | Pricing rule NULL-branch uniqueness verification | ~~Risk of duplicate tenant-level rules.~~ **IMPLEMENTED** (Wave 1). | Application check correct (Prisma `null` → `IS NULL`). Partial unique index added at DB level. 2 regression tests. |
| GAP-006 | Multi-polygon and holes in service regions | ~~Single Polygon only.~~ **IMPLEMENTED** (Wave 4). | `geojsonGeometrySchema` = `Polygon \| MultiPolygon` union. Holes already supported. Column widened to `GEOMETRY(Geometry, 4326)`. Migration. 25 schema tests. |
| GAP-007 | Pricing rule history / audit replay | ~~No history table.~~ **IMPLEMENTED** (Wave 4). | Decision: audit log replay (no separate table). `currency` added to update audit snapshots. Design doc at `pricing-history-design.md`. |
| GAP-008 | Service type delete policy | ~~No delete path.~~ **IMPLEMENTED** (Wave 3). | Runbook at `docs/runbooks/service-type-hard-delete.md`. Pre-check for zero FK references. No admin endpoint (deactivation is the normal lifecycle). |
| GAP-009 | Region deactivation UX for inspectors | ~~No visibility for inspectors.~~ **IMPLEMENTED** (Wave 4). | `service_region.deactivated.v1` event emitted. `NotifyInspectorsOnRegionDeactivationHandler` sends `REGION_DEACTIVATED` emails to mapped inspectors. `findByRegionId` on inspector repo. 5 tests. |
| GAP-010 | Resolve regions batch size limit | ~~Hard cap at 25 appointment IDs.~~ **IMPLEMENTED**. | Raised `resolveRegionsSchema.appointmentIds.max` from 25 to 200. PostGIS `ST_Intersects` handles the larger batch in a single query. No streaming needed. |
