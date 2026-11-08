# Phase 1 Data Model — Early Offer Access by Inspector Level

**No database change. No migration.** This feature adds no table, column, enum, index or constraint. It reads existing data only. The "model" here is one in-memory value object and the shape of an existing platform setting.

## Reads (existing tables, unchanged)

| Table | Columns read | Purpose |
|---|---|---|
| `service_groups` | `published_at`, `scheduled_date`, `status`, `id`, `service_type_id` | window bounds + group identity (existing eligibility already reads status/type/date) |
| `inspectors` | `service_types_json`, `blocked_clients_json`, `status`, `deleted_at` | qualified-eligible existence (service type, active) |
| `inspector_regions` | `region_id`, `inspector_id` | qualified-eligible region link |
| `service_regions` | `geom`, `status` | qualified-eligible region via PostGIS `ST_Intersects` |
| `appointments` / `properties` | `service_group_id`, `property_id`, `tenant_id`, `coordinates`, `deleted_at` | eligibility join + denylist |
| `inspector_reliability_snapshots` (F07-2) | `snapshot_date`, `status`, `score`, `inspector_id` | "scored ≥ minScore in the latest snapshot" + latest snapshot date |

## Value object — `EarlyAccessParams`

Pure, in `service-group/domain/early-access.ts`. Computed once per request by the policy; `null` means "no window — show everything".

| Field | Type | Meaning |
|---|---|---|
| `hours` | `number` | H — window length; the accept path computes `opensAt = publishedAt + hours` |
| `cutoffUtc` | `string` | UTC timestamp text (`Z` stripped) = `now − hours`; a group is in-window only if `published_at > cutoffUtc` |
| `enabledAtUtc` | `string` | UTC timestamp text (`Z` stripped) of activation; a group is in-window only if `published_at >= enabledAtUtc` (L-F08-08) |
| `protectedFrom` | `string` | civil date `YYYY-MM-DD` = `todaySydney + 2`; a group is gated only if `scheduled_date >= protectedFrom` (today/D+1 never gated) |
| `minScore` | `number` | reliability score threshold for level X (`minScoreForLevel(minLevel, levels)`) |
| `latestSnapshotDate` | `string` | civil date of the latest reliability snapshot; the `EXISTS` scores against this date |

Resolution rules (`resolveEarlyAccessParams`), returning `null` for any of:
- `enabled === false`;
- `viewerQualifies === true`;
- `latestSnapshotDate === null` (nobody can qualify → window never applies);
- `enabled === true && enabledAt == null` (manual-edit-only state) → `null` **and** `warn marketplace.early_access_missing_enabled_at`.

## In-memory decision — `isGroupInEarlyAccess(state, params)`

`state = { publishedAt: Date | null, scheduledDate: string|Date, hasQualifiedEligible: boolean }`.
Returns `true` (gate the group) only when **all** hold; `false` otherwise:
`params != null` ∧ `publishedAt != null` ∧ `publishedAt > cutoffUtc` ∧ `publishedAt >= enabledAtUtc` ∧ `scheduledDate >= protectedFrom` ∧ `hasQualifiedEligible`.

The SQL exclusion fragment (`earlyAccessExclusionSql`) encodes the identical predicate so the read paths (SQL) and accept (in-memory) never disagree.

## Existing setting shape — `inspectorProgram.earlyAccess` (no change to the schema)

Already defined in `packages/shared/src/schemas/platform-settings.ts` (F08-1):

```
earlyAccess: {
  enabled:   boolean,                 // off by default
  hours:     int 1..72,               // H
  minLevel:  InspectorLevel,          // X (BRONZE|SILVER|GOLD)
  enabledAt: string(datetime) | null, // server-owned (this task fills it)
}
```

Default: `{ enabled: false, hours: 12, minLevel: 'GOLD', enabledAt: null }`. This slice only changes **who writes `enabledAt`** (the server save-hook), not the schema.

## Lifecycle of `enabledAt` (server-owned, L-F08-08)

```
(no row / enabled:false) --PUT enabled:true--> enabledAt = <PUT instant>
enabled:true  --PUT enabled:true (any other field)--> enabledAt unchanged
enabled:true  --PUT enabled:false--> enabledAt = null
enabled:false --PUT enabled:false--> enabledAt = null
```
A client-supplied `enabledAt` on any PUT is discarded. Each off→on mints a fresh instant.
