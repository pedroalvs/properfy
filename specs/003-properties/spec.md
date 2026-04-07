# Feature Specification: Properties

**Feature Branch**: `003-properties`
**Created**: 2026-04-05
**Feature Status**: IMPLEMENTED (Phase 1) — pending review for Phase 2/3 gaps
**Sources**:
- Code: `apps/backend/src/modules/property/**`, `apps/backend/prisma/schema.prisma`, `packages/shared/src/{schemas,enums}/property*`, `apps/web/src/features/properties/**`
- Approved rules: `.specify/memory/constitution.md`, `CLAUDE.md`, `apps/backend/CLAUDE.md`, `projeto-consolidado/modelo-dados-executavel.md`
- Legacy spec (to be superseded on approval): `specs/backend/property.spec.md`

> **Domain clarification.** A Property is a physical real-estate asset managed by a tenant (agency). It holds structured address, optional coordinates, a per-tenant unique `propertyCode`, a type (`RESIDENTIAL | COMMERCIAL | INDUSTRIAL | RURAL`), and per-property rules (`rules_json`). Coordinates may be populated automatically by a Mapbox-backed geocoder running on pg-boss or set manually by an operator (the latter locks the record against re-geocoding).
>
> **Reading guide.** Every user story declares `Priority`, `Status`, `Source`. Status values: `IMPLEMENTED`, `APPROVED`, `GAP`. Source values: `code`, `dossier`, `inferred`.

## User Scenarios & Testing

### User Story 1 — Register a new property with a structured address

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An operator (AM, OP) or an agency user (CL_ADMIN, CL_USER) registers a new property by providing the internal `propertyCode`, `type`, full address components (`street`, optional `addressLine2`, `suburb`, `postcode`, `state`, `country`), optional notes, and optional per-property rules. The tenant must be active; an optional branch must also be active and belong to the tenant. On creation, the property starts with `geocodingStatus = PENDING` and a background geocoding job is enqueued.

**Why this priority**: Properties are a prerequisite for appointments. Every scheduling flow depends on at least one property record.

**Independent Test**: Seed an active tenant + branch. As CL_ADMIN, `POST /v1/properties` with a valid payload. Confirm (a) the property exists, (b) `geocodingStatus = PENDING`, (c) an audit record is written, (d) a `property.geocode` job is enqueued.

**Acceptance Scenarios**:

1. **Given** an AM actor with `tenantId` in the payload, **When** they submit `POST /v1/properties`, **Then** the property is created under that tenant. OP creates properties within their own tenant only (tenant derived from JWT).
2. **Given** a CL_ADMIN or CL_USER actor, **When** they submit without `tenantId`, **Then** the tenant is derived from the JWT (never from the body).
3. **Given** a tenant that is `PENDING` or `INACTIVE`, **When** any actor attempts creation, **Then** the request fails with `TENANT_INACTIVE`.
4. **Given** a `branchId` that is not `ACTIVE` or does not belong to the tenant, **When** submitted, **Then** the request fails with `BRANCH_INACTIVE` or `BRANCH_NOT_FOUND`.
5. **Given** a `propertyCode` already in use within the same tenant, **When** submitted, **Then** the request fails with `PROPERTY_CODE_CONFLICT`. The same code is allowed in different tenants.
6. **Given** any successful creation, **When** the use case returns, **Then** a `property.geocode` job is enqueued; failure to enqueue does NOT fail the HTTP request (the property stays `PENDING` and can be re-queued later).

---

### User Story 2 — List, filter, and read properties

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

Any authenticated user with access to a tenant browses that tenant's properties through a paginated, filterable list. AM can optionally scope to a specific tenant via a `tenantId` query param; OP and CL roles are locked to their own tenant by JWT. Each row carries the parent branch name where applicable to avoid an N+1 lookup in the UI.

**Independent Test**: Seed 30 properties across two tenants with different types and branches. Exercise each filter (`tenantId`, `branchId`, `type`, `search`, `hasCoordinates`) and verify pagination metadata matches.

**Acceptance Scenarios**:

1. **Given** an AM, **When** they call `GET /v1/properties` with no `tenantId`, **Then** properties across all tenants are returned (subject to pagination).
2. **Given** an AM with a `tenantId` filter, **When** submitted, **Then** only that tenant's properties are returned.
3. **Given** an OP, CL_ADMIN, or CL_USER, **When** they call `GET /v1/properties`, **Then** only their own tenant's properties are returned regardless of any `tenantId` filter passed.
4. **Given** any actor, **When** `hasCoordinates=true` is passed, **Then** only properties with non-null `latitude` and `longitude` are returned.
5. **Given** any actor, **When** they call `GET /v1/properties/:propertyId`, **Then** the full property detail is returned; cross-tenant reads by CL roles return `PROPERTY_NOT_FOUND` (never `FORBIDDEN`).

---

### User Story 3 — Update a property's details and address

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

An operator or agency user updates a property's `type`, `branchId`, address components, `notes`, or `rulesJson`. **Changing any address field re-queues a geocoding job unless manual coordinates are also supplied.** Explicitly providing `latitude`/`longitude` flips `geocodingStatus` to `MANUAL`, which locks the property against further automatic geocoding.

**Independent Test**: Update a property's `suburb` and confirm (a) `geocodingStatus` resets to `PENDING`, (b) a `property.geocode` job is enqueued. In a second test, update the same property with `latitude`/`longitude` in the payload and confirm `geocodingStatus = MANUAL` and no job is enqueued.

**Acceptance Scenarios**:

1. **Given** an authorized actor, **When** they call `PATCH /v1/properties/:propertyId` with a subset of editable fields, **Then** the supplied fields are persisted and an audit record with `before`/`after` is written.
2. **Given** any address field changes (`street`, `suburb`, `postcode`, `state`, `country`), **When** `latitude`/`longitude` are NOT also provided, **Then** `geocodingStatus` is reset to `PENDING` and a `property.geocode` job is enqueued.
3. **Given** a patch that includes both an address change and explicit `latitude`/`longitude`, **When** submitted, **Then** the coordinates are persisted, `geocodingStatus` is set to `MANUAL`, and no geocoding job is enqueued.
4. **Given** a `branchId` change to an inactive or foreign branch, **When** submitted, **Then** the request fails with `BRANCH_INACTIVE` or `BRANCH_NOT_FOUND`.
5. **Given** a CL actor and a property outside their tenant, **When** they attempt the update, **Then** the request is rejected with `FORBIDDEN` or returns `PROPERTY_NOT_FOUND` depending on the lookup path.
6. **Given** an `INSP` actor, **When** they attempt the update, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 4 — Delete a property (soft delete)

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

AM, OP (own tenant), or CL_ADMIN (own tenant) soft-deletes a property that is no longer operated by the agency. Deletion is blocked if the property has any open appointments (`DRAFT`, `AWAITING_INSPECTOR`, `SCHEDULED`) via the cross-module `IAppointmentChecker` port. (`Source: inferred` — the dossiê mandates this blocking rule for tenant/branch deactivation but does not state it textually for property deletion; the pattern is consistent and the implementation applies it here.)

**Independent Test**: Create an appointment on a property → attempt `DELETE /v1/properties/:id` → expect `PROPERTY_HAS_ACTIVE_APPOINTMENTS`. Cancel the appointment → delete again → confirm `deleted_at` is set and the property is hidden from list/get endpoints.

**Acceptance Scenarios**:

1. **Given** an AM, OP, or CL_ADMIN (own tenant) and a property with no open appointments, **When** they call `DELETE /v1/properties/:propertyId`, **Then** `deleted_at` is set, the audit record is written, and the endpoint returns `204`.
2. **Given** a property with at least one open appointment, **When** deletion is attempted, **Then** the request fails with `PROPERTY_HAS_ACTIVE_APPOINTMENTS`.
3. **Given** an already-deleted property, **When** deletion is re-attempted, **Then** the request fails with `PROPERTY_ALREADY_DELETED`.
4. **Given** CL_USER or INSP actors, **When** they call the delete endpoint, **Then** the request is rejected with `FORBIDDEN`.

---

### User Story 5 — Automatic geocoding via Mapbox

- **Priority**: P1
- **Status**: IMPLEMENTED
- **Source**: code

When a property is created or its address changes, a background job enqueues a Mapbox geocoding request. On success, `latitude`, `longitude` are populated and `geocodingStatus` flips to `SUCCESS`. On failure, the property goes to `FAILED` and can be retried manually. A manual coordinate override (`MANUAL`) is permanent and is never overwritten by the background worker. (`GeocodingStatus` four-state enum and its transitions are `IMPLEMENTED (implementation decision)` — the dossiê mandates async geocoding with a pending fallback but does not define the state machine; see `data-model.md` for the full transition diagram.)

**Independent Test**: Create a property → wait for the worker (or invoke it inline in an integration test) → assert `geocodingStatus = SUCCESS` and non-null coordinates. Separately, create a property with an intentionally malformed address → assert `FAILED`.

**Acceptance Scenarios**:

1. **Given** a newly created property, **When** the `property.geocode` job runs and Mapbox returns a valid match, **Then** `latitude`, `longitude` are persisted and `geocodingStatus` becomes `SUCCESS`.
2. **Given** a property whose address cannot be resolved, **When** the job runs, **Then** `geocodingStatus` becomes `FAILED` with no coordinate change.
3. **Given** a property with `geocodingStatus = MANUAL`, **When** the job runs (or is requeued), **Then** the worker is a no-op and does not modify the record.
4. **Given** an AM or OP, **When** they call `POST /v1/properties/:propertyId/geocode`, **Then** the job is re-enqueued (202 Accepted) and `geocodingStatus` is reset to `PENDING`, unless the property is `MANUAL` in which case the request fails with `PROPERTY_GEOCODING_MANUAL_OVERRIDE`.

---

### User Story 6 — Bulk import properties from XLSX or CSV

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

An agency admin (CL_ADMIN), AM, or OP uploads a spreadsheet (XLSX or CSV) with many properties at once. The upload is idempotent via an `Idempotency-Key` header: replaying the same key with the same payload returns the same result, while a different payload with the same key is rejected. The file is stored in Supabase Storage, a `PropertyImport` record is created in `PENDING`, and an async worker processes rows row-by-row, recording successes, warnings, and errors. The caller polls a status endpoint to see progress.

**Independent Test**: Upload a 10-row XLSX with 2 invalid rows, poll `GET /v1/properties/import/:importId`, confirm `status` progresses to `DONE` with `successCount=8` and `errorCount=2` and `errorsJson` contains the row-level messages.

**Acceptance Scenarios**:

1. **Given** an authorized actor and a valid `.xlsx` or `.csv` file with an `Idempotency-Key` header, **When** they `POST /v1/properties/import`, **Then** the response is `202 Accepted` with `importId`, the file is uploaded to storage, a `PropertyImport` row is created in `PENDING`, and a `property.import` job is enqueued.
2. **Given** no `Idempotency-Key` header, **When** the upload is attempted, **Then** the request fails with `VALIDATION_ERROR`.
3. **Given** a replayed request with the same `Idempotency-Key` and the same payload, **When** submitted, **Then** the previous result is returned unchanged.
4. **Given** a file whose extension is not `.xlsx` or `.csv`, **When** uploaded, **Then** the request fails with `VALIDATION_ERROR`.
5. **Given** a CL_USER or INSP actor, **When** they attempt the import, **Then** the request is rejected with `FORBIDDEN`.
6. **Given** an actor without a tenant context (internal user), **When** they attempt the import without supplying a tenant, **Then** the request fails with `VALIDATION_ERROR`.
7. **Given** any authorized actor, **When** they call `GET /v1/properties/import/:importId`, **Then** the current status and counts are returned.
8. **Given** the import endpoint, **When** called more than 5 times per minute by the same client, **Then** requests beyond the limit are rejected with `429`.

---

### User Story 7 — Address autocomplete for property forms

- **Priority**: P2
- **Status**: IMPLEMENTED
- **Source**: code

When a user is typing an address into a property form, the UI calls a typeahead endpoint backed by Mapbox's address lookup. The server returns structured suggestions so the UI can prefill `street`, `suburb`, `postcode`, `state`, `country`, and (if available) `latitude`/`longitude`.

**Independent Test**: As any authenticated user, call `GET /v1/address/suggestions?q=George+St&country=AU` and confirm structured results.

**Acceptance Scenarios**:

1. **Given** any authenticated user, **When** they call `GET /v1/address/suggestions` with a non-empty query, **Then** a list of structured address suggestions is returned.
2. **Given** an invalid or empty query, **When** submitted, **Then** the request fails with `VALIDATION_ERROR`.
3. **Given** Mapbox is down or unreachable, **When** the request fires, **Then** the endpoint falls back gracefully (empty list or stub) and the error is logged — user-facing behavior must not leak provider errors.

---

### Edge Cases

- **Soft-deleted properties**: excluded from all reads and writes; appointments referencing them retain the FK for historical integrity.
- **AM cross-tenant update path**: `UpdatePropertyUseCase` looks up the property with a null tenant scope for AM, then derives the tenant from the row. OP and CL roles use their JWT tenant for lookup.
- **Manual coordinates lock**: once `geocodingStatus = MANUAL`, no automatic geocoding ever modifies the row. Operators must explicitly clear coordinates by patching with `latitude: null, longitude: null` (current code accepts nulls; verify the transition from MANUAL back to PENDING — see GAP-003).
- **PostGIS column `coordinates`**: the schema declares `coordinates Unsupported("GEOMETRY(Point, 4326)")` for future spatial queries; the column is not populated by Phase 1 code (see GAP-004).
- **Geocoding queue failure on create**: by design, a `sendJob` failure during `CreatePropertyUseCase` is swallowed so the HTTP request does not fail. The property remains `PENDING` and must be manually requeued via `POST /v1/properties/:id/geocode`.
- **Import idempotency**: idempotency is keyed by `(idempotencyKey, 'property.import')`. A 24-hour retention is set. After expiry, the same key can be reused.
- **`rules_json` patch semantics**: current code replaces `rules_json` wholesale on update (unlike tenant settings which deep-merge). Consumers must send the full object on every patch.

## Requirements

### Functional Requirements

All FRs below are `Status: IMPLEMENTED, Source: code` unless otherwise noted. The dossiê defines the Property entity fields (`modelo-dados-executavel.md:107`) and the API contracts (`api-contratos-principais.md:90`) but does not specify all operational details (geocoding status machine, import flow, delete blocking). Where an FR goes beyond the dossiê text, it is annotated as `implementation decision`.

- **FR-001**: System MUST enforce `UNIQUE (tenant_id, property_code)` on property creation.
- **FR-002**: System MUST reject property creation when the parent tenant is not `ACTIVE`.
- **FR-003**: System MUST reject property creation or update when a supplied `branchId` is not `ACTIVE` or does not belong to the property's tenant.
- **FR-004**: System MUST derive `tenant_id` from JWT for OP and CL roles and forbid overriding it via request payload. Only AM may specify a `tenantId` in the request.
- **FR-005** (`Source: dossier — infra-tecnologia-production-ready.md:181`): System MUST start every new property with `geocodingStatus = PENDING` and enqueue a `property.geocode` job. On geocode failure, mark `pending_geocode` for operational treatment.
- **FR-006** (`implementation decision`): System MUST treat a queue enqueue failure on create as non-fatal for the HTTP request (property stays `PENDING` and can be re-queued).
- **FR-007** (`implementation decision`): System MUST reset `geocodingStatus` to `PENDING` and enqueue a new geocoding job whenever any address component changes AND no explicit coordinates are provided in the same patch.
- **FR-008** (`implementation decision`): System MUST set `geocodingStatus = MANUAL` when a patch provides explicit `latitude` AND `longitude`, and MUST NOT enqueue a geocoding job for that patch.
- **FR-009** (`implementation decision`): System MUST reject any geocoding reprocess attempt on a property with `geocodingStatus = MANUAL` via `PROPERTY_GEOCODING_MANUAL_OVERRIDE` (verified for `POST /v1/properties/:id/geocode`; see GAP-003 for the inverse unlock path).
- **FR-010**: System MUST soft-delete properties via `deleted_at` and hide deleted rows from all reads.
- **FR-011** (`Source: inferred — consistent with tenant/branch deactivation blocking; not textually explicit for properties in the dossiê`): System MUST block property deletion when `IAppointmentChecker.hasOpenAppointmentsForProperty` returns true.
- **FR-012** (`implementation decision — dossiê does not specify RBAC per role for property deletion`): System MUST restrict deletion to AM, OP (own tenant), and CL_ADMIN (own tenant); CL_USER and INSP are forbidden.
- **FR-013**: System MUST validate `tenant.isActive()` implicitly through the auth middleware; feature-level code assumes middleware has rejected OP and client-role tokens for inactive tenants.
- **FR-014** (`Source: dossier — Mapbox for geocoding`): System MUST support a typeahead endpoint `GET /v1/address/suggestions` backed by a Mapbox adapter with a stub fallback for tests and degraded environments.
- **FR-015** (`implementation decision — dossiê defines import layout for appointments, not properties; property import is an extension of that concept`): System MUST expose bulk import via `POST /v1/properties/import` accepting `.xlsx` and `.csv`, requiring an `Idempotency-Key` header, rate-limited to 5 requests per minute per client.
- **FR-016** (`implementation decision`): System MUST store the uploaded import file in object storage via `IReportStorageService.upload` with `fileKey = imports/properties/<importId>/<filename>`.
- **FR-017** (`implementation decision`): System MUST persist an import job record (`PropertyImport`) and enqueue a `property.import` worker that updates `status`, `successCount`, `errorCount`, and `errorsJson` as rows are processed.
- **FR-018**: System MUST write an audit record for every `property.created`, `property.updated`, and `property.deleted` action, including `before`/`after` snapshots where applicable and `tenantId`.
- **FR-019** (`implementation decision`): System MUST return `branchName` alongside branch id on list results to avoid N+1 lookups in the UI.
- **FR-020**: System MUST validate all property payloads against Zod schemas in `packages/shared/src/schemas/property.ts`.

### Non-Functional Requirements

- **NFR-001** (`Status: APPROVED, Source: dossier`): Property list and detail endpoints SHOULD respond within 300 ms p95 under nominal load.
- **NFR-002** (`Status: IMPLEMENTED, Source: code`): All property list endpoints paginate; unbounded lists are forbidden.
- **NFR-003** (`Status: APPROVED, Source: dossier`): Geocoding jobs MUST be idempotent — replaying the worker on the same `propertyId` must not create duplicate side effects.
- **NFR-004** (`Status: APPROVED, Source: dossier`): Mapbox adapter failures MUST be logged but MUST NOT leak provider error shapes to clients.

### Key Entities

- **Property** — `id`, `tenant_id`, `branch_id`, `property_code` (unique per tenant), `type`, full address fields, `lat`/`lng`, `geocoding_status`, `notes`, `rules_json`, `coordinates` (PostGIS, unused in Phase 1), timestamps + `deleted_at`.
- **PropertyImport** — `id`, `tenant_id`, `status`, `file_key`, `original_filename`, `total_rows`, `success_count`, `error_count`, `errors_json`, `created_by_user_id`, timestamps. Tracks a single bulk-import job.
- **IAppointmentChecker** (port, shared with feature 002) — used by delete path.
- **IGeocodingService** / **IAddressLookupService** (ports) — Mapbox adapters with stub fallbacks.

Full schema and invariants in [`data-model.md`](./data-model.md). HTTP contracts in [`contracts/`](./contracts/).

## Success Criteria

- **SC-001**: 100% of property reads and writes scope by `tenant_id` for OP and client roles. AM reads may span tenants but are never unintentionally global (pagination enforced).
- **SC-002**: Every `create`, `update`, and `delete` produces exactly one audit record. Import-batch audit coverage is tracked as GAP-005.
- **SC-003**: Integration tests assert the geocoding status machine: `PENDING → SUCCESS`, `PENDING → FAILED`, `SUCCESS → PENDING on address change`, `SUCCESS → MANUAL on explicit coords`, `MANUAL → (locked)`.
- **SC-004**: Idempotent imports verified: same key + same file returns cached response; same key + different file returns conflict or cached response (confirm behavior — see GAP-006).
- **SC-005**: Property deletion blocked by open appointments is verified with a real `PrismaAppointmentChecker` in integration tests.
- **SC-006**: Mapbox adapter failures do not fail the HTTP request for create/update; the property remains in `PENDING` until the worker resolves it.

## Assumptions

- **`PropertyType` enum** (`RESIDENTIAL | COMMERCIAL | INDUSTRIAL | RURAL`) is an `implementation decision`. The dossiê lists `type` as a field (`modelo-dados-executavel.md:117`) but does not enumerate the canonical values. The current enum may be extended without a dossiê amendment.
- **Property import** (`POST /v1/properties/import`) is an `implementation decision`. The dossiê defines import layout in the context of **appointments** (`regras-negocio-respostas-cliente.md:335`), not properties. The property import reuses the same infrastructure pattern (XLSX/CSV, idempotency, async worker) but is not itself a dossiê-mandated feature.
- Country defaults to `AU` in Phase 1. Multi-country operations exist but are not the primary use case.
- Address autocomplete is scoped by an optional `country` parameter; globally unrestricted when omitted.
- **`rules_json` ownership**: this feature **persists** the field but does **not own its shape or semantics**. The canonical schema for `rules_json` is defined by feature 006-appointments (scheduling constraints). This feature stores the JSON verbatim and replaces it wholesale on update (no deep-merge). Any validation of the content must come from feature 006's schema; this feature treats it as opaque. See GAP-007 for the formalization of the cross-feature contract.
- Geocoding runs exclusively via pg-boss; no synchronous Mapbox call is made in the HTTP request path.
- The Supabase Storage bucket used for imports is shared across features; `IReportStorageService` is the only write path.
- PostGIS is available but spatial queries are not implemented in Phase 1 (GAP-004).
- **ServiceRegion integration**: geographic coverage of properties depends on `ServiceRegion`, which is **per-tenant** (decision 2026-04-06, see constitution v1.2.0). The `properties.coordinates` PostGIS column (GAP-003) is the canonical geospatial point for matching a property to a region via `ST_Contains`. Any future feature that queries "which region covers this property" must scope the lookup by the property's `tenant_id`.
- The same address lookup adapter can be reused by feature 002 (branches) and feature 006 (appointments) — tracked as a cross-feature consolidation opportunity.

## Known Gaps

> Summary index only. Detail in [`tasks.md`](./tasks.md) under Phase 2.

| ID | Title | Impact | Context |
|---|---|---|---|
| GAP-001 | Shared address schema across tenant, property, appointments | ~~Multiple address shapes.~~ **IMPLEMENTED** (Wave 1). | `propertyAddressSchema` + `propertyAddressUpdateSchema` in `packages/shared/src/schemas/address.ts`. `createPropertySchema`/`updatePropertySchema` composed via `.merge()`. Flat fields preserved for API compat. 10 schema tests. |
| GAP-002 | Manual coordinate unlock path | ~~No flow to re-geocode MANUAL properties.~~ **IMPLEMENTED** (Wave 1). | Clearing both lat/lng on MANUAL property → `geocodingStatus = PENDING` + geocode job enqueued. 3 tests. |
| GAP-003 | PostGIS `coordinates` column unused | ~~Never populated.~~ **IMPLEMENTED** (Wave 2). | `syncCoordinates()` in Prisma repo writes `ST_SetSRID(ST_MakePoint(...), 4326)` on every lat/lng change. Backfill migration `20260407000001`. Radius filter on `GET /v1/properties` via `nearLat`/`nearLng`/`nearRadiusKm` using `ST_DWithin`. 8 tests. |
| GAP-004 | Hard delete / archival runbook | ~~No runbook.~~ **IMPLEMENTED** (Wave 1). | Runbook at `docs/runbooks/property-hard-delete.md`. 10-step cascade, verification queries, audit retention. No admin endpoint. |
| GAP-005 | Import audit granularity | ~~No batch-level audit.~~ **IMPLEMENTED** (Wave 3). | `property.imported.batch` audit record written after import completes with `importId`, `totalRows`, `successCount`, `errorCount`, `propertyIds`. 7 tests. |
| GAP-006 | Idempotency conflict semantics | ~~Silent cache on key reuse regardless of payload.~~ **IMPLEMENTED** (Wave 3). | SHA-256 file hash stored with idempotency record. Same key + different file → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`. Migration for `payload_hash` column. Backward-compatible with legacy records. 4 tests. |
| GAP-007 | `rules_json` schema | ~~Opaque and unvalidated.~~ **IMPLEMENTED** (Wave 4). | `propertyRulesSchema` in shared: `keyRequired`, `meetingLocation`, `keyLocation`, `accessInstructions`, `parkingInfo`, `petInfo`, `specialNotes`. `.passthrough()` for forward-compat. 12 tests. |
| GAP-008 | Property import error export | ~~No download endpoint.~~ **IMPLEMENTED** (Wave 3). | `ExportImportErrorsUseCase` + route `GET /v1/properties/import/:importId/errors.csv`. CSV with `row,field,code,message` columns. Proper escaping. 12 tests. |
| GAP-009 | Address autocomplete rate limit & caching | ~~No caching or rate limiting.~~ **IMPLEMENTED** (Wave 4). | `CachedAddressLookupService` decorator with 5-min TTL, 1000-entry LRU. Rate limit 30/min on suggestions route. 10 tests. |
| GAP-010 | Geocoding retry policy and DLQ alerting | ~~No retry or alerting.~~ **IMPLEMENTED** (Wave 2). | Jobs enqueued with `retryLimit: 6, retryBackoff: true`. `GeocodeRetryWorker` (6h schedule) re-enqueues FAILED properties after 24h cool-off. `geocoding.failedCount` gauge metric. 5 tests. |
