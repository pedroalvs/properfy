# Phase 1 UI Contract — F10-2 (Web)

The feature exposes **no new API**. This documents the consumed backend routes (all already in `api-types.ts`), the React Query keys, and the public component props the web introduces.

## Consumed backend routes (F10-1, `/v1`)

| Route | Verb | Roles (role-matrix) | Web usage |
|---|---|---|---|
| `/property-files/presign` | POST | `property_file.upload` (AM/OP/CL_ADMIN) | start upload (type DOCUMENT/REPORT/OTHER or ISSUE photo) |
| `/property-files/confirm` | POST (Idempotency-Key) | same | finalize upload after PUT |
| `/property-files` | GET | `property_file.read` (AM/OP/CL_ADMIN/CL_USER) | list READY files + `counts` by propertyId/appointmentId[+type] |
| `/property-files/{id}/download` | GET | `property_file.read` | 5-min signed URL (preview/download/new-tab) |
| `/property-files/{id}/versions` | POST | `property_file.version` (AM/OP/CL_ADMIN) | New version (presign step) |
| `/property-files/{id}` | DELETE | `property_file.delete` (AM/OP) | soft delete |
| `/property-issues` | POST (Idempotency-Key) | `property_issue.create` (AM/OP/CL_ADMIN) | create issue w/ photoFileIds |
| `/property-issues` | GET | `property_file.read` | list issues + photos |
| `/property-issues/unseen-count` | GET | `property_issue.unseen_count` (AM/OP/CL_ADMIN) | sidebar dots |
| `/property-issues/{id}/seen` | POST | `property_issue.mark_seen` (AM/OP/CL_ADMIN) | mark as seen (CAS, idempotent) |
| `/property-issues/{id}` | DELETE | `property_issue.delete` (AM/OP) | soft delete issue + photos |
| `/appointments`, `/properties` | GET | existing | add `withIssues` query param; read `hasUnseenIssues` per row |
| `/appointments/{id}`, `/properties/{id}` | GET | existing | read `fileCounts` |
| `/platform-settings/propertyFiles` | GET/PUT | AM/OP | Files settings section (via `usePlatformSetting`) |

All multi-tenant isolation, INSP T-1 masking and CL_USER read-only are server-enforced; cross-tenant access returns **404** (the web renders a not-found/empty state).

## React Query keys & invalidation

| Key | Owner hook | staleTime | Invalidated by |
|---|---|---|---|
| `['property-files', scopeId, type?]` | `usePropertyFiles` | default (30s) | upload/version/delete file, create issue (ISSUE photos) |
| `['property-issues', scopeId]` | `usePropertyIssues` | default | create/mark-seen/delete issue |
| `['property-issues','unseen-count']` | `useUnseenIssueCount` | **60s** | mark-seen, create issue, delete issue |
| `['appointments']` / `['properties']` | existing lists | existing | mark-seen/create/delete issue (border refresh) |
| `['property-appointments', propertyId]` | `usePropertyAppointments` (reused) | existing | property-context `appointmentId → code` map for "Appointment #{code}" |
| `['platform-settings','propertyFiles']` | `usePlatformSetting` | existing | save |

`scopeId` = `propertyId` or `appointmentId` depending on `PanelContext`. In property context, the panel reuses the property's appointments query to resolve each linked item's `appointmentId` to its human code; an unresolved id falls back to a plain **Open appointment** link (never the raw id).

## New/changed component props (public surface)

```ts
// NEW primitive: components/shell/SidebarItemBadge.tsx
interface SidebarItemBadgeProps { count: number; label?: string } // renders yellow dot + aria-label `${count} unseen issues`

// SidebarItem.tsx / Sidebar NavItem — additive optional field
interface SidebarItemProps { /* existing */ badge?: boolean }     // + badge content supplied by Sidebar from unseen-count

// components/data/DataTable.tsx — additive optional prop
interface DataTableProps<T> { /* existing */ rowClassName?: (row: T) => string | undefined }

// features/property-files reusable panel
type PanelContext =
  | { kind: 'appointment'; appointmentId: string; propertyId: string }
  | { kind: 'property'; propertyId: string };
interface PropertyFilesPanelProps { context: PanelContext; initialSubtab?: FileSubtab }

interface PropertyFilesSettingsSectionProps { onDirtyChange?: (dirty: boolean) => void } // matches F03-4 section contract
```

## Behavioural contracts (acceptance-linked)

- **C.A1**: a file with `appointmentId` set appears in both the appointment panel and the property panel under the same subtab; property side shows "Appointment #{code}" + Open appointment.
- **C.A3**: New version POSTs to `/versions`; the Versions drawer lists/downloads every `version` in the `versionGroupId`.
- **C.A5**: a presign/confirm 400 (bad mime/size) is surfaced verbatim as a clear message.
- **Indicators**: `hasUnseenIssues` → row border (AM/OP/CL_ADMIN); unseen-count → sidebar dot; mark-seen clears both after invalidation.
- **503**: any file route returning 503/`STORAGE_NOT_CONFIGURED` → `FILE_STORAGE_UNAVAILABLE_MESSAGE`.
