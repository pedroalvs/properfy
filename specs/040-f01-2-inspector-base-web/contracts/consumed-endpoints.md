# Contracts — consumed endpoints & UI contract

This feature defines **no new API contract**. It consumes endpoints shipped and frozen by TASK-F01-1 (in `develop` @ `cff52a98`) via the typed `openapi-fetch` client and `packages/shared/src/api-types.ts`. Listed here for traceability only.

## Consumed API endpoints (owned by F01-1 — not modified here)

| Endpoint | Method | What the web uses | Where |
|---|---|---|---|
| `/v1/inspectors` | GET | List with `?missingBaseAddress=true`; read `address`, `baseLat`, adoption fields per item | `useInspectorList` / table |
| `/v1/inspectors/:inspectorId` | GET | Detail: `address`, `baseLat/baseGeocodedAt`, `appInstalledAt/appLastSeenAt/pushEnabled/appVersion` | `useInspectorDetail` / detail sections |

The create/edit write paths (`POST`/`PATCH /v1/inspectors`) and `/v1/address/suggestions` are consumed by the F01-1 drawer, which is out of scope here (spec Clarifications). All inspector-response fields consumed by F01-2 are typed **optional** in `api-types.ts`; the UI degrades to "—" when absent (expand/contract consumer side).

## UI contract (what this feature adds, acceptance-visible)

### Table — new columns (after `status`, sortable, nulls last) + badge + filter
- **App**: "Installed" (tooltip "Installed on {date} (any device)") / "—" (tooltip "Not installed").
- **Push**: "On" / "Off" / "—" ("No data yet"); On/Off tooltip "Browser notification permission on the last device seen".
- **Last seen**: relative; tooltip "Last reported {date time} (Sydney) · reported at most every 6 h"; "Never"; "Just now".
- **Badge** "No base address" beside name when `baseLat` null; tooltip "Missing base address" (`address` null) / "Address could not be located" (`address` present).
- **Filter** toggle "No base address" → `missingBaseAddress=true`; empty state "No inspectors without a base address."

### Detail — new sections
- **"Base address"** (after Personal Details): formatted address / "Not set"; "Located · Updated {date}" / "Could not be located". No raw coordinates.
- **"App adoption"** (after Workload): Installed / Push / Last seen (relative+absolute, "reported at most every 6 h") / App version; "Last device seen" caption; all fallbacks for a never-opened app.
