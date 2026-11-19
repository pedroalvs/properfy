# Phase 1 Data Model: Permanent Geocoding Compliance

One expand-only migration (`<ts>_permanent_geocoding_markers`): three nullable columns, no backfill, no contract, no long lock. The migration MUST NOT drop the `Unsupported()` PostGIS index on `properties.coordinates`.

## New columns

| Table | Column | Prisma | SQL type | Null | Default | Index | Meaning |
|---|---|---|---|---|---|---|---|
| `properties` | `geocoded_permanently_at` | `DateTime?` | `timestamp(3)` | yes | `NULL` | none | When lat/lng were written from a **permanent** geocode. `NULL` = no coordinate, `MANUAL`, or legacy temporary. |
| `properties` | `geocoding_failure_code` | `String? @db.VarChar(64)` | `varchar(64)` | yes | `NULL` | none | Reason a `FAILED` is **not** auto-retried. Values: `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE` (this task); `LEGACY_PERMANENT_NO_RESULT` (X02-2, not written here). |
| `branches` | `geocoded_permanently_at` | `DateTime?` | `timestamp(3)` | yes | `NULL` | none | When `address_json.latitude/longitude` were written from a permanent geocode. |

Branch coordinates stay inside `address_json` (JSON, client-supplied, overwritten wholesale on update), so the marker lives in a column — keeping the X02-2 script idempotent and letting the branch update decide whether it may keep the stored coordinates without re-geocoding.

## Entities (behavioral, not new tables)

### PropertyEntity (extended)
- New optional props: `geocodedPermanentlyAt?: Date | null` (default `null`), `geocodingFailureCode?: string | null` (default `null`). Optional + defaulted so existing fixtures and untyped test wirings keep compiling (memory `project_adding_usecase_dep_breaks_untyped_test_wirings`).
- `applyGeocodingResult(result, { permanent: true })` sets the marker.
- Coordinates: `lat/lng Decimal(10,7)` mirrored to `coordinates GEOMETRY(Point,4326)` — written only via the repository.

### BranchEntity (extended)
- New optional prop `geocodedPermanentlyAt?: Date | null`.
- `IBranchRepository.update` accepts the marker.

### Repository contract deltas
- `IPropertyRepository.update` accepts `geocodedPermanentlyAt` and `geocodingFailureCode`, keeps syncing `coordinates`.
- `findFailedGeocoding(before)` adds `geocoding_failure_code IS NULL`.
- `countBlockedFailedGeocoding(): Promise<number>` (new) — rows that are `FAILED` with a non-null failure code.
- `IBranchRepository.update` accepts `geocodedPermanentlyAt`.

## State transitions — property geocoding status

| From | Event | To | Marker | Failure code | Side effect |
|---|---|---|---|---|---|
| PENDING/any | permanent success (create/worker/commit-with-mode) | SUCCESS | `now()` | `NULL` | `coordinates` synced |
| PENDING | account error (worker) | FAILED | unchanged (NULL) | `MAPBOX_PERMANENT_GEOCODING_UNAVAILABLE` | audit w/ code, `logger.error`, no throw |
| PENDING | null result (worker) | FAILED | NULL | `NULL` | audit "no results"; 24h sweep still applies |
| PENDING | generic error (worker) | FAILED | NULL | `NULL` | audit "service error" |
| SUCCESS/PENDING/FAILED | PATCH lat/lng ≠ stored (7dp) | MANUAL | `NULL` | — | no job |
| SUCCESS/PENDING/FAILED | PATCH lat/lng = stored, or null/null (non-MANUAL), or incomplete pair | unchanged | unchanged | unchanged | debug log; address-change flow if address also changed |
| MANUAL | PATCH both null (unlock) | PENDING | `NULL` | `NULL` | geocode job |
| any non-MANUAL | address changed | PENDING | `NULL` | `NULL` | geocode job |
| any | `POST /:id/geocode` | PENDING | unchanged | `NULL` | geocode job |
| MANUAL | worker runs | (skipped) | NULL | — | geocoder not called |

Invariant: no branch ever writes `geocodingStatus = 'MANUAL'` with a null lat or lng.

## Branch geocoding (no status column; marker only)

| Case | `address_json` written | Marker | Mapbox called |
|---|---|---|---|
| create success | `{ ...address, latitude, longitude }` | `now()` | yes (permanent, 4s) |
| create null/error/timeout | `{ ...address }` (no coords) | `NULL` explicit | yes (failed) |
| update, no `address` | untouched | untouched | no |
| update, same address (`isSameGeocodingAddress`) + marker present | `{ ...address, latitude: old, longitude: old }` | kept | **no** |
| update, same address + marker NULL (legacy) | geocoded | per success/fail | yes |
| update, different address, success | `{ ...address, latitude, longitude }` | `now()` | yes |
| update, different address, null/error/timeout | `{ ...address }` (coords dropped) | `NULL` explicit | yes (failed) |

A geocoding failure NEVER fails the branch save.
