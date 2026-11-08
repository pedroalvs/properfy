# Phase 1 Data Model — F10-2 (Web)

This feature defines **no new persisted entity**. It consumes the F10-1 contract shapes (from `@properfy/shared`) and derives small UI view-models. Server shapes are authoritative; the web never widens or persists them.

## Consumed contract shapes (`@properfy/shared`)

### `PropertyFileResponse` (`propertyFileResponseSchema`)
| Field | Type | UI use |
|---|---|---|
| `id` | uuid | key, download/version/delete target |
| `propertyId` | uuid | cross-navigation to property |
| `appointmentId` | uuid \| null | "Appointment #{code}" badge + Open appointment (property side) |
| `issueId` | uuid \| null | groups issue photos |
| `type` | `ISSUE`\|`DOCUMENT`\|`REPORT`\|`OTHER` | subtab routing |
| `versionGroupId` | uuid | Versions drawer grouping |
| `version` | int | "v{n}" label |
| `fileName` | string | display + name search |
| `mime` | string | preview/icon/PDF decision |
| `sizeBytes` | int | display (humanized) |
| `status` | `PENDING`\|`READY` | list shows READY only (server already filters) |
| `uploadedByUserId` | uuid \| null | **never rendered as id** (see research D5) |
| `createdAt` | instant (ISO) | date via shared helper (Sydney) |

### `PropertyIssueResponse` (`propertyIssueResponseSchema`)
| Field | Type | UI use |
|---|---|---|
| `id` | uuid | key, seen/delete target |
| `propertyId` / `appointmentId?` | uuid / uuid\|null | cross-navigation + "Appointment #{code}" |
| `reason` | string (1–1000) | card body |
| `source` | `INSPECTOR`\|`STAFF`\|`RENTAL_TENANT_PORTAL` | origin badge + author label |
| `createdByUserId` | uuid \| null | **not rendered** (source label used) |
| `cantDoEventId` | uuid \| null | not surfaced in web (PWA/field concern) |
| `seenAt` / `seenByUserId` | instant\|null / uuid\|null | "Seen · {date}" (+ "by you") / Mark-as-seen gate |
| `createdAt` | instant | date via shared helper |
| `photos` | `PropertyFileResponse[]` | photo grid (download; icon for non-renderable) |

### Other consumed shapes
- `FileCounts` `{ total, issues, documents, reports, other }` — appointment/property **detail** payload (`fileCounts?`) and list-files `counts`. Drives tab/subtab counts.
- `PropertyIssueUnseenCountResponse` `{ appointmentsWithUnseenIssues, propertiesWithUnseenIssues }` — sidebar dots.
- `MarkPropertyIssueSeenResponse` `{ seen, alreadySeen, seenAt, seenByUserId }` — mark-as-seen result (idempotent).
- `PresignPropertyFileUploadResponse` `{ fileId, uploadUrl, storageKey, expiresAt }` — upload/version step.
- `PropertyFileDownloadResponse` `{ url, expiresAt }` — 5-min download.
- `PropertyFilesSetting` `{ allowedMimes, maxFileSizeMb(5–200), issueImageMimes, maxPhotosPerIssue(1–20), retentionDays(≥1\|null), deletedRetentionDays(30–3650) }` — platform settings form.
- List enrichment on `Appointment`/`Property` payloads: `hasUnseenIssues?: boolean`, `fileCounts?: FileCounts`; list query filter `withIssues?: boolean`.

## Web view-models (derived, not persisted)

- **FileSubtab** = `'issues' | 'documents' | 'reports' | 'other'`; maps to `PropertyFileType` (`issues→ISSUE`, etc.). The Issues subtab renders `PropertyIssueResponse[]`; the other three render `PropertyFileResponse[]` of that type.
- **PanelContext** = `{ kind: 'appointment', appointmentId, propertyId } | { kind: 'property', propertyId }`. Drives which list query runs, whether the appointment selector shows on upload, and whether the "Appointment #{code}" badge / Open appointment appear.
- **AppointmentCodeMap** = `Record<appointmentId, code>` — derived in property context from the reused `usePropertyAppointments(propertyId)` query, used to render "Appointment #{code}" for linked items. An id missing from the map falls back to a code-less **Open appointment** link (never the raw id). The upload appointment-selector (property context) uses the same list.
- **IssueCardViewModel** = `{ reason, originLabel, createdAtText, photos, seenText | markSeenAction }` — derived in `lib/issue-format.ts`; `originLabel` from `source`, `seenText` from `seenAt`/`seenByUserId` (+ current user), dates via shared Sydney helpers. **No id fields.**
- **UploadState** (per upload / per photo) = `{ status: 'idle'|'uploading'|'confirming'|'done'|'error', error?: string }` — drives per-photo progress in the create-issue drawer.

## Validation rules (client-side, mirroring the contract)

- Issue reason: trimmed, 1–1000 chars (blocks submit; matches `createPropertyIssueSchema`).
- Issue photos: 1..`min(maxPhotosPerIssue, available)`; only `issueImageMimes` offered (accept hint); server is authority.
- Document/Report/Other: `accept` hint from `allowedMimes`; size/magic-bytes enforced server-side (C.A5) and surfaced.
- Platform settings bounds per `propertyFilesSettingSchema` (see table above); at least one allowed MIME and one issue image MIME.

## State transitions (UI-visible, server-owned)

- Issue: unseen → seen (via mark-as-seen; idempotent; clears indicators). Issue/file: active → deleted (soft; removed from UI). Photo: PENDING → READY (on create-issue) — the web shows only confirmed photos in the drawer and READY photos in the card.
