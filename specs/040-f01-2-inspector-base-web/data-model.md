# Phase 1 — Data Model (view-model / consumed fields)

This feature persists nothing; it consumes the F01-1 contract. The "model" here is the set of API fields the web reads/writes and the view-model derived for display. Field names and optionality are taken verbatim from `packages/shared/src/api-types.ts` (verified in-worktree).

## Consumed API fields (inspector response — list item, detail, write)

| Field | Type (api-types) | Used by | Display rule |
|---|---|---|---|
| `address` | `unknown` (optional) | drawer (prefill), table (badge tooltip) | Parse with `inspectorBaseAddressSchema`; compatible → structured fields / `toAddressSuggestion`; incompatible (legacy) → raw via `formatAddressLabel` + "incomplete" notice |
| `baseLat` | `number \| null` (optional) | table (badge), detail (located), drawer (inline alert) | `null` → "No base address" badge / "Could not be located". **Never rendered as a number.** |
| `baseLng` | `number \| null` (optional) | — | Never displayed |
| `baseGeocodedAt` | `string \| null` (optional) | detail ("Located · Updated {date}") | Sydney civil date |
| `baseGeocodeFailed` | `boolean` (optional) | drawer (save feedback) | `true` → warning snackbar |
| `appInstalledAt` | `string \| null` (optional) | table (App), detail (Installed) | date "Installed on {date} (any device)" / "Not installed" |
| `appLastSeenAt` | `string \| null` (optional) | table (Last seen), detail (Last seen) | relative + Sydney absolute tooltip w/ "reported at most every 6 h"; `null` → "Never"; future → "Just now" |
| `pushEnabled` | `boolean \| null` (optional) | table (Push), detail (Push notifications) | `true`→"On", `false`→"Off", `null`→"—"/"No data yet"; tooltip "…last device seen" |
| `appVersion` | `string \| null` (optional) | detail (App version) | value as received (e.g. `0.1.0+ab12cd3`) / "—" |

## Write paths

None. The create/edit drawer that writes `address` is owned by F01-1 and is out of scope (spec Clarifications 2026-10-30). F01-2 is read-only consumption plus one new read query param (`missingBaseAddress`).

## Derived view-model (new)

### Table row view-model (per inspector)
- `app`: `appInstalledAt ? 'installed' : 'none'`
- `push`: `pushEnabled === true ? 'on' : pushEnabled === false ? 'off' : 'none'`
- `lastSeen`: `{ relative, absoluteSydney } | 'never'`
- `missingBase`: `baseLat == null`; badge tooltip from `address` (`null` → "Missing base address", present → "Address could not be located")

## State transitions

None. This is a read-mostly presentation feature with two write paths (create/update) that go through the existing save hook. No lifecycle/state machine is introduced.
