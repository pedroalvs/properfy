# Data Model: Legacy Permanent Re-Geocoding

**Feature**: `044-x02-2-legacy-regeocode` | **Date**: 2026-10-30

No migration. All tables and columns already exist (TASK-X02-1 and earlier). This document records the entities the script reads and writes, the selection predicates, and the new repository methods (ports) it needs.

## Tables touched (existing schema — IMPLEMENTED REALITY)

### `properties` (`prisma/schema.prisma`, tenant-scoped)

| Column | Type | Role in this feature |
|---|---|---|
| `id` | uuid (text) | cursor key for batched selection |
| `tenant_id` | uuid | CAS scope; `--tenant` filter |
| `property_code` | text | report identity |
| `lat`, `lng` | `Decimal(10,7)?` | legacy coordinate; CAS `expected`; new value on success |
| `coordinates` | `GEOMETRY(Point,4326)?` (Unsupported) | kept consistent via `syncCoordinates` (never written directly by the script) |
| `geocoding_status` | enum text (`PENDING`/`SUCCESS`/`FAILED`/`MANUAL`) | selection + write target |
| `geocoded_permanently_at` | `DateTime?` | **idempotency marker** — set on a permanent write; `NULL` ⇒ legacy/MANUAL/absent |
| `geocoding_failure_code` | `VarChar(64)?` | `LEGACY_PERMANENT_NO_RESULT` (set here) / `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE` (retry target) |
| `street`, `address_line_2`, `suburb`, `state`, `postcode`, `country` | text | geocode query via `formatGeocodingQuery` |
| `updated_at` | `DateTime @updatedAt` | **CAS token** read at selection |
| `deleted_at` | `DateTime?` | soft-delete exclusion |

### `branches` (`prisma/schema.prisma:214`, tenant-scoped)

| Column | Type | Role |
|---|---|---|
| `id`, `tenant_id` | uuid | CAS scope; `--tenant` filter |
| `name` | text | report identity |
| `address_json` | `Json?` | holds `latitude`/`longitude` (+ address fields `formatGeocodingQuery` reads); updated via jsonb merge |
| `geocoded_permanently_at` | `DateTime?` (`:223`) | idempotency marker for branches |
| `updated_at` | `DateTime @updatedAt` (`:225`) | CAS token |
| `deleted_at` | `DateTime?` (`:226`) | soft-delete exclusion |

### `appointment_imports` (tenant-scoped)

| Column | Role |
|---|---|
| `status` | selection: `<> 'PREVIEW' AND <> 'PROCESSING'` |
| `preview_json` | holds `rows[].property.geocode` (`geocodeVerificationSchema`); legacy `found` without `mode` → `null` |
| `tenant_id` | `--tenant` filter |

### `audit_logs` (`prisma/schema.prisma:850`)

Read-only here. `entity_type` (`'Property'`), `entity_id` (text uuid), `action` (`'property.updated'`), `before_json`, `after_json`, `created_at`, `redaction_status` (default `'NONE'`). Indexes `(entity_type, entity_id)` and `(action)`. The `property.updated` `before`/`after` payload is `{ propertyCode, type, street, suburb, state, country, geocodingStatus }` — **no lat/lng** (verified in `update-property.use-case.ts:244-275`), which forces the two-proof false-MANUAL rule.

## Selection predicates

- **Legacy properties**: `deleted_at IS NULL AND lat IS NOT NULL AND geocoding_status <> 'MANUAL' AND geocoded_permanently_at IS NULL AND (geocoding_failure_code IS NULL OR geocoding_failure_code <> 'LEGACY_PERMANENT_NO_RESULT')` [`AND tenant_id = :tenant`], ORDER BY `id`, batches of 100, returning `updated_at`.
- **Legacy branches**: `deleted_at IS NULL AND geocoded_permanently_at IS NULL AND address_json ? 'latitude'` [`AND tenant_id = :tenant`], `$queryRaw`, returning `updated_at`.
- **False-MANUAL candidates**: `geocoding_status = 'MANUAL' AND lat IS NOT NULL AND lng IS NOT NULL AND deleted_at IS NULL` LEFT JOIN the latest (`DISTINCT ON (entity_id) … ORDER BY entity_id, created_at DESC`) `property.updated` audit transitioning into MANUAL (`after_json->>'geocodingStatus' = 'MANUAL' AND COALESCE(before_json->>'geocodingStatus','') <> 'MANUAL'`), returning `before_json`, `after_json`, `redaction_status`, `audit_log_id`, `transitioned_at`, `updated_at`. [`AND tenant_id = :tenant`] on the inner `manual_props`.
- **Committed import previews**: `status <> 'PREVIEW' AND status <> 'PROCESSING' AND preview_json IS NOT NULL` [`AND tenant_id = :tenant`].
- **Account-blocked (retry)**: `deleted_at IS NULL AND geocoding_status = 'FAILED' AND geocoding_failure_code = 'MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE'` [`AND tenant_id = :tenant`].

## New repository methods (port `ILegacyRegeocodeRepository`)

Declared in a new domain file `domain/legacy-regeocode.repository.ts` (narrow, script-scoped port — the shared `IPropertyRepository` is untouched), implemented by the existing `PrismaPropertyRepository` class in `infrastructure/prisma-property.repository.ts` so coordinate writes reuse its private `syncCoordinates`. All coordinate writes run a CAS `updateMany` + `syncCoordinates` inside one `$transaction`, so PostGIS stays consistent and a concurrent edit is skipped. Each write returns `boolean` (a row changed). Branch and import helpers are thin raw-SQL methods on the same class (branches/imports have no PostGIS).

| Method | CAS `where` | `data` written | Side effect |
|---|---|---|---|
| `applyPermanentBackfill(id, tenantId, expected:{lat,lng,updatedAt}, next:{lat,lng})` | `{ id, tenant_id, lat: expected.lat, lng: expected.lng, updated_at: expected.updatedAt, geocoding_status: { not:'MANUAL' }, geocoded_permanently_at: null }` | `{ lat: next.lat, lng: next.lng, geocoding_status:'SUCCESS', geocoded_permanently_at: now, geocoding_failure_code: null }` | `syncCoordinates(id, next.lat, next.lng)` if changed |
| `markLegacyNoResult(id, tenantId, expected:{lat,lng,updatedAt})` | same CAS | `{ geocoding_status:'FAILED', geocoding_failure_code:'LEGACY_PERMANENT_NO_RESULT' }` | **none** — lat/lng/coordinates unchanged |
| `restoreFalseManual(id, tenantId, expected:{lat,lng,updatedAt}, next:{lat,lng})` | `{ id, tenant_id, geocoding_status:'MANUAL', lat: expected.lat, lng: expected.lng, updated_at: expected.updatedAt }` | `{ lat: next.lat, lng: next.lng, geocoding_status:'SUCCESS', geocoded_permanently_at: now, geocoding_failure_code: null }` | `syncCoordinates` if changed |
| `backfillBranchCoordinates(id, tenantId, expected:{updatedAt}, next:{latitude,longitude})` | `$executeRaw` `WHERE id=$id AND tenant_id=$t AND geocoded_permanently_at IS NULL AND updated_at=$read` | `address_json = address_json || jsonb_build_object('latitude',$lat,'longitude',$lng), geocoded_permanently_at = now(), updated_at = now()` | returns affected>0 |

Read methods:

| Method | Returns |
|---|---|
| `findLegacyCoordinateCandidates(cursor, limit, tenantId?)` | `{ id, tenantId, propertyCode, lat, lng, street, addressLine2, suburb, state, postcode, country, updatedAt }[]` (≤ limit, `id > cursor`) |
| `findLegacyBranchCandidates(cursor, limit, tenantId?)` | `{ id, tenantId, name, addressJson, updatedAt }[]` |
| `findManualWithTransitionAudit(cursor, limit, tenantId?)` | `{ id, tenantId, propertyCode, lat, lng, street, addressLine2, suburb, state, postcode, country, updatedAt, auditLogId, transitionedAt, redactionStatus, beforeJson, afterJson }[]` (auditLogId null ⇒ missingAudit) |
| `findAddressChangesAfter(ids, transitionedAtById, tenantId?)` | map `id → boolean` (a later `property.updated` changed street/suburb/state/country) |
| `findImportPreviewsToStrip(cursor, limit, tenantId?)` | `{ id, previewJson }[]` |
| `findAccountBlockedProperties(cursor, limit, tenantId?)` | `{ id, tenantId }[]` |

> **Note (minimal-impact)**: the exact method set is the design target; `/speckit.tasks` may group the two batched read helpers (`findAddressChangesAfter`) with the audit query. The non-negotiable contract is: coordinate writes only via the repository's `$transaction` + `syncCoordinates`; every write CAS-guarded on `updated_at`; branch writes via jsonb merge that never rewrites the address.

## State transitions caused by the script (`--apply` only)

```
legacy property (PENDING|FAILED|SUCCESS, no marker) --geocode ok--> SUCCESS + marker
legacy property                                      --geocode null--> FAILED + LEGACY_PERMANENT_NO_RESULT (coords kept)
false MANUAL (proofs 1+2)                            --restore-------> SUCCESS + marker
account-blocked FAILED                               --retry---------> PENDING (code cleared) + property.geocode job
legacy branch (marker null, has latitude)            --geocode ok----> address_json.lat/lng merged + marker
```

No change ever writes `MANUAL`, never deletes a coordinate except via the normal worker path (not here), and never rewrites a branch address.
