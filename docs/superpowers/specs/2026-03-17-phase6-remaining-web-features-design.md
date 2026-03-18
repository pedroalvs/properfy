# Phase 6: Remaining Web Features — Design Specification

## Context

Phases 1-5 are complete. The web frontend covers: appointments (full CRUD + detail + create), properties (list + detail), service groups (list), inspectors (list), users (list), tenants (list + detail), financial (entries + invoices), reports, dashboard, auth (login + 2FA), tenant portal, service types management, pricing rules management, settings (account + security), and audit logs. **208 test files, 1188 tests, typecheck + build passing.**

All backend modules are fully implemented (17 modules). The remaining web features complete the platform before PWA development begins.

---

## 6A: Import Wizards (Property + Appointment)

### Purpose

Allow AM/OP/CL_ADMIN users to bulk-import properties and appointments via CSV/XLSX upload. Backend workers already process imports asynchronously — this phase adds the frontend upload UX.

### UX Pattern: Multi-step Wizard

**Step 1 — Upload:** File picker (CSV/XLSX, max 5MB), drag-and-drop zone, file type validation client-side.

**Step 2 — Preview/Validate:** Parse file client-side, show first 10 rows in a preview table. Highlight validation errors (missing required fields, invalid formats) row-by-row with red indicators. Show summary: total rows, valid rows, error rows. User cannot proceed if error count > 0.

**Step 3 — Confirm:** Summary card showing total rows to import, estimated time. "Start Import" button with idempotency key generation. Calls `POST /v1/{entity}/import` with multipart file.

**Step 4 — Progress/Results:** Poll `GET /v1/{entity}/import/:importId` every 3 seconds. Show progress bar (successCount / totalRows). On completion, show results summary: success count, error count, error details table (row number, field, error message). "View Imported Records" link to entity list page.

### Backend Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/appointments/import` | POST | Upload appointment CSV/XLSX (multipart, `Idempotency-Key` header) |
| `/v1/appointments/import/:importId` | GET | Poll import status |
| `/v1/properties/import` | POST | Upload property CSV/XLSX (multipart, `Idempotency-Key` header) |
| `/v1/properties/import/:importId` | GET | Poll import status |

### Import Status Shape

```typescript
interface ImportStatus {
  id: string;
  tenantId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  originalFilename: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errorsJson: Array<{ row: number; field: string; message: string }> | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}
```

### Files

**Shared wizard components** (reusable for both property and appointment imports):

| File | Purpose |
|---|---|
| `components/import/ImportWizard.tsx` + test | Multi-step wizard container with step navigation |
| `components/import/FileUploadStep.tsx` + test | Drag-and-drop file zone + file picker |
| `components/import/PreviewStep.tsx` + test | Preview table with validation errors |
| `components/import/ConfirmStep.tsx` + test | Summary card + start import button |
| `components/import/ProgressStep.tsx` + test | Progress bar + results summary + error table |
| `components/import/index.ts` | Barrel |

**Appointment import feature:**

| File | Purpose |
|---|---|
| `features/appointments/hooks/useAppointmentImport.ts` + test | POST upload + GET polling |
| `features/appointments/pages/AppointmentImportPage.tsx` + test | Wizard page using shared components |

**Property import feature:**

| File | Purpose |
|---|---|
| `features/properties/hooks/usePropertyImport.ts` + test | POST upload + GET polling |
| `features/properties/pages/PropertyImportPage.tsx` + test | Wizard page using shared components |

**Modify:**
- `router.tsx` — add `/appointments/import` (AM, OP, CL_ADMIN) and `/properties/import` (AM, OP, CL_ADMIN)
- `AppointmentListPage.tsx` — add "Import" secondary action button
- `PropertyListPage.tsx` — add "Import" secondary action button

### Client-side File Parsing

Use `papaparse` (CSV) library for client-side preview. XLSX files: use `xlsx` (SheetJS) library for parsing. Both produce row arrays for the preview table. Validation rules:
- **Appointment CSV:** required columns: `branchId`, `serviceTypeId`, `scheduledDate`, `timeSlot`, `contactName`
- **Property CSV:** required columns: `propertyCode`, `type`, `street`, `suburb`, `state`, `postcode`

### Authorization

- AM, OP: import for any tenant
- CL_ADMIN: import for own tenant only

---

## 6B: Inspector Availability Slots

### Purpose

AM/OP users manage inspector availability slots from the web admin. Inspectors manage their own calendar in the PWA (future phase).

### Web Admin View (AM/OP)

**Primary view: Table with filters.** Columns: inspector name, date, start time, end time, region, capacity, status. Filters: inspector (autocomplete), date range, status (ACTIVE/FULL/EXPIRED). Form drawer for create/edit slots. Role restriction: AM/OP only.

**Secondary view: Calendar toggle.** Toggle button switches between table and calendar. Calendar shows a weekly grid for a selected inspector. Slots displayed as time blocks on the calendar. Read-only visualization — create/edit still via form drawer. Helps AM/OP visually check an inspector's schedule before assigning.

### Backend Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/inspectors/:inspectorId/availability-slots` | POST | Create slot |
| `/v1/inspectors/:inspectorId/availability-slots` | GET | List slots (paginated, filterable) |
| `/v1/inspectors/:inspectorId/availability-slots/:slotId` | PATCH | Update slot |

### Availability Slot Shape

```typescript
interface AvailabilitySlot {
  id: string;
  inspectorId: string;
  inspectorName?: string;
  date: string;          // YYYY-MM-DD
  startTime: string;     // HH:mm
  endTime: string;       // HH:mm
  regionJson: unknown | null;
  capacity: number;
  status: 'ACTIVE' | 'FULL' | 'EXPIRED';
  createdAt: string;
  updatedAt: string;
}
```

### Files

**New feature:** `apps/web/src/features/availability-slots/`

| File | Purpose |
|---|---|
| `types/index.ts` | `AvailabilitySlot`, `SlotFormData`, `SlotFiltersState`, defaults |
| `hooks/useSlotList.ts` + test | GET paginated slots across inspectors |
| `hooks/useSlotSave.ts` + test | POST create + PATCH update |
| `hooks/index.ts` | Barrel |
| `components/SlotTable.tsx` + test | Table with columns |
| `components/SlotFilters.tsx` + test | Inspector autocomplete, date range, status |
| `components/SlotFormDrawer.tsx` + test | Create/edit drawer |
| `components/SlotCalendarView.tsx` + test | Weekly calendar grid for selected inspector |
| `components/SlotViewToggle.tsx` + test | Toggle between table and calendar |
| `components/index.ts` | Barrel |
| `pages/AvailabilitySlotListPage.tsx` + test | Page with toggle between table and calendar |
| `pages/index.ts` | Barrel |
| `index.ts` | Feature barrel |

**Modify:**
- `router.tsx` — add `/availability-slots` with `AuthGuard [AM, OP]`
- `Sidebar.tsx` — add "Availability" under a "Scheduling" submenu or standalone nav item

### Calendar View Implementation

- Weekly grid: 7 columns (Mon-Sun), rows per hour (06:00-22:00)
- Inspector selector dropdown at the top
- Week navigation (prev/next week arrows)
- Slots rendered as colored blocks spanning their time range
- Status colors: ACTIVE = green, FULL = blue, EXPIRED = gray
- Click on slot block opens detail drawer (read-only from calendar view)
- No drag-to-create in web — that's a PWA feature

### Role-Specific Behavior (Explicit)

| Role | Primary View | Can Create/Edit | Calendar Access |
|---|---|---|---|
| AM / OP | Table with filters | Yes (form drawer) | Yes (toggle) |
| INSP (PWA, future) | Calendar (weekly) | Yes (tap to add/remove) | Primary view |

---

## 6C: Notification Templates Management

### Purpose

AM/OP users configure notification templates per agency. Templates use dynamic variables for personalization. No HTML editing — plain text with variables only in this phase.

### Backend Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/notification-templates` | GET | List templates (paginated) |
| `/v1/notification-templates/:templateCode/:channel` | PUT | Create or update template |

### Template Shape

```typescript
interface NotificationTemplate {
  id: string;
  tenantId: string | null;
  templateCode: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
  subject: string | null;         // Email only
  bodyHtml: string | null;        // Not editable in this phase
  bodyText: string;               // Editable plain text with variables
  variablesJson: unknown;         // List of available variables
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Allowed Variables (Controlled List)

Variables are defined per template code. The UI must display only the allowed variables and validate that users don't introduce invalid placeholders.

| Variable | Description |
|---|---|
| `{{tenant_name}}` | Agency name |
| `{{contact_name}}` | Tenant/contact name |
| `{{property_address}}` | Full property address |
| `{{scheduled_date}}` | Appointment date |
| `{{time_slot}}` | Time window |
| `{{inspector_name}}` | Assigned inspector |
| `{{appointment_code}}` | Appointment reference code |
| `{{confirmation_link}}` | Tenant portal link |
| `{{agency_phone}}` | Agency contact phone |

### Validation Rules

1. **Allowed placeholders only:** Regex scan for `{{...}}` patterns; reject any not in the controlled list above.
2. **No raw HTML:** Strip or reject `<` and `>` characters in bodyText.
3. **Required variables per template type:** e.g., initial notice must include `{{confirmation_link}}`.
4. **Preview rendering:** Replace variables with sample data for visual preview before saving.

### Files

**New feature:** `apps/web/src/features/notification-templates/`

| File | Purpose |
|---|---|
| `types/index.ts` | `NotificationTemplate`, `TemplateFormData`, `TemplateFiltersState`, `ALLOWED_VARIABLES`, defaults |
| `hooks/useTemplateList.ts` + test | GET paginated templates |
| `hooks/useTemplateSave.ts` + test | PUT upsert with variable validation |
| `hooks/index.ts` | Barrel |
| `components/TemplateTable.tsx` + test | Columns: code, channel, subject, active status, actions |
| `components/TemplateFilters.tsx` + test | Channel select, active status, search |
| `components/TemplateFormDrawer.tsx` + test | Edit form with variable insertion toolbar |
| `components/VariableInsertToolbar.tsx` + test | Clickable variable chips that insert `{{var}}` at cursor |
| `components/TemplatePreview.tsx` + test | Rendered preview with sample data |
| `components/index.ts` | Barrel |
| `pages/NotificationTemplateListPage.tsx` + test | List page |
| `pages/index.ts` | Barrel |
| `index.ts` | Feature barrel |

**Modify:**
- `router.tsx` — add `/notification-templates` with `AuthGuard [AM, OP]`
- `Sidebar.tsx` — add "Notification Templates" under Configuration submenu

---

## 6D: Map Views (Mapbox)

### Purpose

Three map-based views providing geographic context for properties, appointments, and service groups. Delivery priority: **Appointment map → Service group view → Property map.**

### Shared Map Infrastructure

Before building feature-specific maps, create shared map components per the CLAUDE.md design system spec:

| Component | Purpose |
|---|---|
| `components/map/MapContainer.tsx` + test | Mapbox GL JS wrapper with token config, default center/zoom |
| `components/map/MapMarker.tsx` + test | Reusable marker with status color, click handler |
| `components/map/MapPopup.tsx` + test | Popup card on marker click (entity summary) |
| `components/map/MapScreenLayout.tsx` + test | Full-height layout: sidebar filters + map area |
| `components/map/MapFiltersPanel.tsx` + test | Collapsible filter panel overlaying map |
| `components/map/MapFloatingAction.tsx` + test | FAB for map actions (re-center, toggle layers) |
| `components/map/index.ts` | Barrel |

### 6D.1: Appointment Map (Priority 1)

Shows scheduled appointments as colored pins (status-based). AM/OP dispatch view.

**Features:**
- Pins colored by appointment status (same as `APPOINTMENT_STATUS_MAP`)
- Click pin → popup with appointment code, address, date, status, inspector
- Click popup → navigate to `/appointments/:id`
- Filters: status, date range, inspector, service type
- Cluster markers when zoomed out

**Files:**

| File | Purpose |
|---|---|
| `features/appointments/pages/AppointmentMapPage.tsx` + test | Map page with filters |
| `features/appointments/hooks/useAppointmentMapData.ts` + test | GET appointments with lat/lng for map pins |

**Modify:**
- `router.tsx` — add `/appointments/map` with `AuthGuard [AM, OP]`
- Sidebar or AppointmentListPage — add map view toggle/link

### 6D.2: Service Group Geographic View (Priority 2)

Visualize service groups with their appointments plotted on a map. Shows group coverage area.

**Features:**
- Service group list in side panel
- Select group → plot its appointments on map
- Pin colors by appointment status within the group
- Group summary card in side panel (size, date, inspector, status)
- Click appointment pin → popup with detail

**Files:**

| File | Purpose |
|---|---|
| `features/service-groups/pages/ServiceGroupMapPage.tsx` + test | Map + side panel layout |
| `features/service-groups/hooks/useServiceGroupMapData.ts` + test | GET groups with nested appointment locations |

**Modify:**
- `router.tsx` — add `/service-groups/map` with `AuthGuard [AM, OP]`

### 6D.3: Property Map (Priority 3)

All properties plotted on map. Property management spatial view.

**Features:**
- Pins colored by property type (same as `PROPERTY_TYPE_MAP`)
- Click pin → popup with property code, address, type
- Click popup → navigate to `/properties/:id`
- Filters: type, branch, geocoding status
- Cluster markers when zoomed out

**Files:**

| File | Purpose |
|---|---|
| `features/properties/pages/PropertyMapPage.tsx` + test | Map page with filters |
| `features/properties/hooks/usePropertyMapData.ts` + test | GET properties with lat/lng |

**Modify:**
- `router.tsx` — add `/properties/map` with `AuthGuard [AM, OP, CL_ADMIN, CL_USER]`

### Mapbox Configuration

- Library: `mapbox-gl` + `react-map-gl`
- Token: from environment variable `VITE_MAPBOX_TOKEN`
- Default center: Australia (-25.2744, 133.7751), zoom 4
- Style: `mapbox://styles/mapbox/light-v11`

---

## 6E: Marketplace Page

### Purpose

Inspectors view and accept available service group offers. Web version for AM/OP to also monitor marketplace activity.

### UX: Map + Side Panel with Strong List Fallback

**Map area (main):** Mapbox showing offer locations as pins. Pin color by priority mode (standard = blue, 24h priority = orange). Click pin → highlight in side panel.

**Side panel (strong list):** Scrollable list of offer cards. Each card shows: scheduled date, time window, service type, group size, priority mode, payout estimate. Cards are filterable and sortable — the panel is a fully functional list view, not just a map companion. Accept/reject buttons on each card.

**Offer detail expansion:** Click card or pin → expand to show: full appointment list within group, total payout calculation, region coverage. Accept button with confirmation dialog.

### Backend Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/marketplace/offers` | GET | List available offers (inspector context) |
| `/v1/marketplace/offers/:groupId/accept` | POST | Accept offer (idempotency key) |

### Marketplace Offer Shape

Uses `ServiceGroupResponse` from existing schema (status PUBLISHED, with nested appointments and location data).

### Files

**New feature:** `apps/web/src/features/marketplace/`

| File | Purpose |
|---|---|
| `types/index.ts` | `MarketplaceOffer`, `OfferFiltersState`, defaults |
| `hooks/useMarketplaceOffers.ts` + test | GET paginated offers |
| `hooks/useOfferAccept.ts` + test | POST accept with idempotency |
| `hooks/index.ts` | Barrel |
| `components/OfferCard.tsx` + test | Offer summary card with accept/reject |
| `components/OfferDetailPanel.tsx` + test | Expanded detail with appointment list |
| `components/OfferFilters.tsx` + test | Date range, service type, priority mode |
| `components/OfferMapPins.tsx` + test | Map pin layer for offers |
| `components/index.ts` | Barrel |
| `pages/MarketplacePage.tsx` + test | MapScreenLayout + side panel |
| `pages/index.ts` | Barrel |
| `index.ts` | Feature barrel |

**Modify:**
- `router.tsx` — add `/marketplace` with `AuthGuard [AM, OP, INSP]`
- `Sidebar.tsx` — add "Marketplace" nav item

---

## 6F: E2E Playwright Tests

### Purpose

End-to-end coverage of critical platform flows. Tests run against a seeded test database with known data.

### Priority Structure

#### P0 — Happy Paths (must pass for deploy)

| # | Flow | Steps |
|---|---|---|
| 1 | **Login + auth guards** | credentials → dashboard; logout; protected route without session redirects to login |
| 2 | **Appointment lifecycle** | create → release → marketplace accept → tenant confirmation → scheduled → done |
| 3 | **Marketplace inspector flow** | list offers → view detail → accept → verify assigned |
| 4 | **Property CRUD** | create → view detail → edit → verify changes |
| 5 | **Import wizard** | upload CSV → preview → confirm → verify imported records in list |
| 6 | **Financial critical flow** | view entries → approve batch → generate invoice → verify invoice in list |
| 7 | **Tenant management** | create agency → add branch → deactivate → verify blocked access |
| 8 | **Security settings** | change password → login with new password; setup 2FA → login with TOTP |
| 9 | **Audit logs** | filter by entity type → open drawer → verify event detail matches |

#### P0 — Negative Paths (must pass for deploy)

| # | Flow | Steps |
|---|---|---|
| 10 | **Import validation error** | upload CSV with invalid rows → preview shows errors → cannot proceed |
| 11 | **Deactivated tenant access** | deactivate tenant → attempt login → verify blocked |
| 12 | **Permission denied** | CL_USER attempts sensitive action (financial, service type) → verify snackbar/redirect |
| 13 | **Visible error feedback** | trigger API error → verify snackbar displays user-friendly message |

#### P1 — Extended Coverage (should pass, non-blocking)

| # | Flow | Steps |
|---|---|---|
| 14 | **Map/dispatch path** | appointment appears on map → click pin → detail popup correct |
| 15 | **RBAC smoke** | CL_USER cannot access AM-only routes; AM/OP can access all routes |
| 16 | **Notification templates** | edit template → verify preview → save |
| 17 | **Availability slots** | create slot → verify in table → toggle calendar view |
| 18 | **Report generation** | request report → poll status → download |

### Test Infrastructure

| File | Purpose |
|---|---|
| `e2e/fixtures/seed-data.ts` | Test data seeding (users, tenants, properties, appointments) |
| `e2e/fixtures/auth.ts` | Login helper, role-based sessions |
| `e2e/helpers/navigation.ts` | Common page navigation patterns |
| `e2e/helpers/assertions.ts` | Reusable assertion helpers (snackbar, table row, status chip) |
| `e2e/p0-happy/*.spec.ts` | 9 P0 happy path test files |
| `e2e/p0-negative/*.spec.ts` | 4 P0 negative path test files |
| `e2e/p1-extended/*.spec.ts` | 5 P1 extended test files |
| `playwright.config.ts` | Already configured — verify settings |

---

## Implementation Order

| Phase | Feature | Dependencies | Estimated Files |
|---|---|---|---|
| **6A** | Import Wizards | None (standalone) | ~20 files |
| **6B** | Availability Slots | None (standalone) | ~18 files |
| **6C** | Notification Templates | None (standalone) | ~18 files |
| **6D** | Map Views | Mapbox library setup | ~22 files |
| **6E** | Marketplace Page | 6D (shared map components) | ~16 files |
| **6F** | E2E Playwright Tests | All features complete | ~22 files |

**Parallelization:** 6A, 6B, 6C are independent and can be built in any order. 6D must precede 6E (shared map infra). 6F comes last.

## Router Changes (Consolidated)

```
/appointments/import     → AppointmentImportPage (AM, OP, CL_ADMIN)
/properties/import       → PropertyImportPage (AM, OP, CL_ADMIN)
/availability-slots      → AvailabilitySlotListPage (AM, OP)
/notification-templates  → NotificationTemplateListPage (AM, OP)
/appointments/map        → AppointmentMapPage (AM, OP)
/service-groups/map      → ServiceGroupMapPage (AM, OP)
/properties/map          → PropertyMapPage (AM, OP, CL_ADMIN, CL_USER)
/marketplace             → MarketplacePage (AM, OP, INSP)
```

## Sidebar Changes (Consolidated)

Update Configuration submenu:
```
Configuration
  ├── Service Types (existing)
  ├── Pricing Rules (existing)
  └── Notification Templates (new)
```

Add new nav items:
```
Availability Slots (new, standalone or under Scheduling)
Marketplace (new, standalone)
```

Map views accessible via toggle buttons on their respective list pages, not as separate sidebar items.

## Verification

```bash
pnpm --filter web typecheck    # 0 errors
pnpm --filter web test         # all tests pass
pnpm --filter web build        # production build succeeds
pnpm --filter web test:e2e     # E2E tests pass (after 6F)
```
