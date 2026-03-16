# Appointments – Web Feature Spec

> Portal: Master Admin + Client Portal (apps/web)
> Last updated: 2026-03-15

---

## 1. Overview

The Appointments feature is the core entity of the Properfy platform. It covers the full lifecycle of a property inspection appointment: creation, scheduling, inspector assignment, execution, and financial settlement. This spec covers the web-facing views for operators (Master Admin portal) and agency users (Client Portal).

**Portals involved:**
- Portal Master Admin (roles: AM, OP)
- Portal Imobiliaria/Cliente (roles: CL_ADMIN, CL_USER)

**Pages/screens:**
1. Appointments List (`/appointments`)
2. Create Appointment (`/appointments/new`)
3. Appointment Detail/Edit (`/appointments/:id`)
4. Import Appointments (`/appointments/import`)

---

## 2. Pages & Routes

| Path | Component | Portal | Description |
|---|---|---|---|
| `/appointments` | `AppointmentsListPage` | Both | Filterable table of all appointments |
| `/appointments/new` | `AppointmentCreatePage` | Both | Multi-step creation form |
| `/appointments/:id` | `AppointmentDetailPage` | Both | Detail view with tabs and transitions |
| `/appointments/import` | `AppointmentImportPage` | Both (OP+) | XLSX bulk import |

Route definitions use React Router v6. All routes require authentication. Role-based access is enforced at the route level via an `<AuthGuard>` wrapper.

```tsx
// Route definitions
<Route path="/appointments" element={<AuthGuard roles={['AM','OP','CL_ADMIN','CL_USER']}><AppointmentsListPage /></AuthGuard>} />
<Route path="/appointments/new" element={<AuthGuard roles={['AM','OP','CL_ADMIN']}><AppointmentCreatePage /></AuthGuard>} />
<Route path="/appointments/:id" element={<AuthGuard roles={['AM','OP','CL_ADMIN','CL_USER']}><AppointmentDetailPage /></AuthGuard>} />
<Route path="/appointments/import" element={<AuthGuard roles={['AM','OP']}><AppointmentImportPage /></AuthGuard>} />
```

---

## 3. TypeScript Interfaces

```typescript
// Appointment status enum
type AppointmentStatus =
  | 'DRAFT'
  | 'AWAITING_INSPECTOR'
  | 'SCHEDULED'
  | 'DONE'
  | 'CANCELLED'
  | 'REJECTED';

// Tenant confirmation status enum
type TenantConfirmationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'UNAVAILABLE'
  | 'NO_RESPONSE';

// Service type enum
type ServiceType =
  | 'ROUTINE'
  | 'INGOING'
  | 'OUTGOING'
  | 'VACATE'
  | 'MAINTENANCE';

// Property type (nested)
interface PropertySummary {
  id: string;
  propertyCode: string;
  streetAddress: string;
  suburb: string;
  postcode: string;
  state: string;
  type: 'RESIDENTIAL' | 'COMMERCIAL' | 'LAND';
}

// Branch summary (nested)
interface BranchSummary {
  id: string;
  name: string;
  tenantId: string;
}

// Inspector summary (nested)
interface InspectorSummary {
  id: string;
  fullName: string;
  phone: string;
}

// Tenant contact
interface TenantContact {
  name: string;
  email: string | null;
  phone: string | null;
}

// Financial snapshot (read-only on appointment)
interface AppointmentFinancialSnapshot {
  basePrice: number;
  inspectorPayout: number;
  platformFee: number;
  currency: string; // "AUD"
}

// Audit log entry
interface AuditLogEntry {
  id: string;
  action: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus | null;
  actorId: string;
  actorName: string;
  actorRole: string;
  reason: string | null;
  createdAt: string; // ISO 8601
}

// Notification log entry
interface NotificationLogEntry {
  id: string;
  type: 'EMAIL' | 'SMS';
  event: string;
  recipient: string;
  status: 'SENT' | 'FAILED' | 'QUEUED';
  sentAt: string | null;
  createdAt: string;
}

// Full appointment (detail view)
interface Appointment {
  id: string;
  tenantId: string;
  branchId: string;
  branch: BranchSummary;
  propertyId: string;
  property: PropertySummary;
  serviceType: ServiceType;
  status: AppointmentStatus;
  tenantConfirmationStatus: TenantConfirmationStatus;
  scheduledDate: string; // "YYYY-MM-DD"
  timeSlot: string; // "09:00-11:00"
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  restrictions: string | null;
  notes: string | null;
  tenantContact: TenantContact;
  inspector: InspectorSummary | null;
  financialSnapshot: AppointmentFinancialSnapshot | null;
  doneCheckedByUserId: string | null;
  idempotencyKey: string | null;
  cancelReason: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// List item (lighter payload from /v1/appointments)
interface AppointmentListItem {
  id: string;
  scheduledDate: string;
  timeSlot: string;
  property: Pick<PropertySummary, 'id' | 'propertyCode' | 'streetAddress' | 'suburb'>;
  serviceType: ServiceType;
  status: AppointmentStatus;
  tenantConfirmationStatus: TenantConfirmationStatus;
  inspector: Pick<InspectorSummary, 'id' | 'fullName'> | null;
  branch: Pick<BranchSummary, 'id' | 'name'>;
  createdAt: string;
}

// Paginated list response
interface PaginatedAppointments {
  data: AppointmentListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Create appointment payload
interface CreateAppointmentPayload {
  branchId: string;
  propertyId: string;
  serviceType: ServiceType;
  scheduledDate: string; // "YYYY-MM-DD"
  timeSlot: string; // "HH:MM-HH:MM"
  keyRequired: boolean;
  meetingLocation?: string;
  keyLocation?: string;
  restrictions?: string;
  notes?: string;
  tenantContact: TenantContact;
}

// Update appointment payload
interface UpdateAppointmentPayload {
  scheduledDate?: string;
  timeSlot?: string;
  keyRequired?: boolean;
  meetingLocation?: string;
  keyLocation?: string;
  restrictions?: string;
  notes?: string;
  tenantContact?: Partial<TenantContact>;
}

// Status transition payload
interface TransitionAppointmentPayload {
  toStatus: AppointmentStatus;
  reason?: string;
  doneCheckedByUserId?: string; // required for SCHEDULED → DONE
}

// List filters
interface AppointmentFilters {
  status?: AppointmentStatus[];
  serviceType?: ServiceType[];
  branchId?: string;
  inspectorId?: string;
  dateFrom?: string; // "YYYY-MM-DD"
  dateTo?: string;
  search?: string; // address or tenant name
  page?: number;
  pageSize?: number;
  sortBy?: 'scheduledDate' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// Import result
interface ImportRow {
  rowNumber: number;
  status: 'OK' | 'WARNING' | 'ERROR';
  data: Partial<CreateAppointmentPayload>;
  messages: string[];
}

interface ImportResult {
  totalRows: number;
  accepted: number;
  warnings: number;
  errors: number;
  rows: ImportRow[];
}
```

---

## 4. Screens

### 4.1 Appointments List (`/appointments`)

**Layout template:** `MainLayout` with full-width table panel.

**Components used:**
- `AppointmentFiltersBar` – top filter row
- `AppointmentTable` – data table
- `AppointmentStatusChip` – status badge in table
- `TenantConfirmationChip` – confirmation badge in table
- `QuickActionsMenu` – per-row actions dropdown
- `ExportButton` – triggers XLSX download
- `Pagination` – page controls

**Data consumed:**
```
GET /v1/appointments?status=&serviceType=&branchId=&inspectorId=&dateFrom=&dateTo=&search=&page=&pageSize=&sortBy=&sortOrder=
→ PaginatedAppointments
```

**React Query key:**
```typescript
['appointments', 'list', filters] // filters is AppointmentFilters object
```

**States:**

| State | UI behavior |
|---|---|
| Loading | Skeleton rows (10 rows) in table body |
| Empty (no filter) | Empty state illustration + "Create your first appointment" CTA |
| Empty (filtered) | "No appointments match your filters" + clear filters link |
| Error | Error alert banner with retry button |
| No permission | Redirect to `/403` or show permission denied card |

**Available actions by role:**

| Action | AM | OP | CL_ADMIN | CL_USER |
|---|---|---|---|---|
| View list | Y | Y | Y | Y |
| Create new | Y | Y | Y | N |
| Export XLSX | Y | Y | Y | N |
| Import XLSX | Y | Y | N | N |
| Quick transition | Y | Y | Partial | N |

**Table columns:**

| Column | Type | Sortable | Notes |
|---|---|---|---|
| Scheduled Date | date | Y | Format: "Mon 15 Mar 2026" |
| Address | text | N | streetAddress + suburb |
| Service Type | badge | N | e.g. "Routine" |
| Status | `AppointmentStatusChip` | Y | See color mapping |
| Tenant | text | N | name + `TenantConfirmationChip` |
| Inspector | text | N | fullName or "—" |
| Actions | menu | N | contextual quick actions |

**Filter bar:**
- Multi-select status dropdown (all statuses listed)
- Single-select service type
- Branch select (scoped to tenant for CL roles; all for AM/OP)
- Inspector select (AM/OP only)
- Date range picker (dateFrom / dateTo)
- Text search input (debounced 300ms)
- "Clear Filters" button (appears when any filter active)

---

### 4.2 Create Appointment (`/appointments/new`)

**Layout template:** `MainLayout` with centered form card (max-width 800px).

**Components used:**
- `BranchSelect` – dropdown scoped to user's tenant (or all for OP/AM)
- `PropertySearch` – combobox with async search + "Create new" option
- `ServiceTypeSelect` – dropdown
- `DatePicker` – calendar picker (min: today)
- `TimeSlotSelect` – dropdown of predefined slots
- `KeyRequiredToggle` – boolean toggle
- `TenantContactForm` – sub-form for name, email, phone
- `PricingPreview` – read-only card showing price/payout snapshot
- `FormActions` – submit + cancel buttons

**Data consumed:**
```
GET /v1/branches (scoped to tenant or all) → BranchSummary[]
GET /v1/properties?search=&branchId= → PropertySummary[]
GET /v1/pricing-rules?branchId=&serviceType= → { basePrice, inspectorPayout, platformFee }
POST /v1/appointments → Appointment
```

**States:**

| State | UI behavior |
|---|---|
| Form idle | All fields enabled |
| Pricing loading | Skeleton in PricingPreview |
| Submitting | Submit button shows spinner, fields disabled |
| Submit error | Inline error banner above form actions |
| Submit success | Redirect to `/appointments/:newId` with success toast |

**Available actions by role:**

| Action | AM | OP | CL_ADMIN | CL_USER |
|---|---|---|---|---|
| Access page | Y | Y | Y | N |
| Select any branch | Y | Y | N (own tenant) | N |

**Form fields and validations:**

| Field | Required | Validation |
|---|---|---|
| Branch | Yes | Must be valid branch ID |
| Property | Yes | Must be existing property ID OR inline create |
| Service Type | Yes | Must be valid ServiceType enum value |
| Scheduled Date | Yes | Must be >= today |
| Time Slot | Yes | Must be valid slot from available list |
| Key Required | Yes | Boolean, default false |
| Tenant Name | Yes | Min 2 chars, max 100 chars |
| Tenant Email | Conditional | Valid email format if provided; required if no phone |
| Tenant Phone | Conditional | Valid Australian phone format if provided; required if no email |
| Meeting Location | No | Max 255 chars |
| Key Location | No | Max 255 chars |
| Restrictions | No | Max 1000 chars |
| Notes | No | Max 1000 chars |

**Inline property creation:**
When user clicks "Create new property" in PropertySearch:
- Opens `PropertyCreateInlineModal`
- On success, auto-selects new property in the combobox
- Does NOT navigate away from create form

**Pricing preview behavior:**
- Triggers when `branchId` + `serviceType` are both selected
- Re-fetches on change of either field
- Shows currency AUD, formatted as dollar amounts
- If no pricing rule found: shows "No pricing rule configured" warning

---

### 4.3 Appointment Detail (`/appointments/:id`)

**Layout template:** `MainLayout` with header section + tab panel.

**Header section:**
- Appointment ID (truncated)
- Property address (bold, large)
- Status badge (`AppointmentStatusChip`) + date
- Transition action buttons (contextual, see Section 5)

**Tabs:**
1. Overview
2. Contact & Restrictions
3. Timeline (audit log)
4. Notifications
5. Financial

**Data consumed:**
```
GET /v1/appointments/:id → Appointment
GET /v1/appointments/:id/audit-log → AuditLogEntry[]
GET /v1/appointments/:id/notifications → NotificationLogEntry[]
```

**React Query keys:**
```typescript
['appointments', 'detail', id]
['appointments', 'audit-log', id]
['appointments', 'notifications', id]
```

**States (page-level):**

| State | UI behavior |
|---|---|
| Loading | Full-page skeleton matching header + tab layout |
| Not found | 404 card with "Back to appointments" link |
| Error | Error card with retry button |
| No permission | 403 card (tenant isolation violation) |

---

#### Tab 1: Overview

**Components:**
- `AppointmentInfoCard` – branch, property code, service type, date/time slot, key required
- `InspectorCard` – inspector name, phone (if assigned); "Unassigned" state if null
- `FinancialSnapshotCard` – base price, inspector payout, platform fee (read-only)
- `MapPreview` – Mapbox embed showing property coordinates (if geocoded)

**Available actions by role:**

| Action | AM | OP | CL_ADMIN | CL_USER |
|---|---|---|---|---|
| Edit appointment fields | Y | Y | Y (pre-DONE) | N |
| View financial snapshot | Y | Y | N | N |
| View inspector details | Y | Y | Y | Y |

---

#### Tab 2: Contact & Restrictions

**Components:**
- `TenantContactCard` – name, email, phone (editable inline for OP+)
- `RestrictionsCard` – restrictions text (editable for OP+)
- `LogisticsCard` – meeting location, key location (editable for OP+)

**Edit behavior:**
- Inline edit with "Edit" toggle button
- Save triggers `PATCH /v1/appointments/:id`
- Optimistic update with rollback on error

---

#### Tab 3: Timeline

**Components:**
- `AuditTimeline` – vertical timeline of `AuditLogEntry` items
- Each entry shows: timestamp, actor (name + role badge), action, from/to status, reason (if any)
- Entries are read-only

**Empty state:** "No timeline entries yet."

---

#### Tab 4: Notifications

**Components:**
- `NotificationLogTable` – table of sent notifications
- Columns: type (EMAIL/SMS), event, recipient, status chip, sent at

**Status chips:**
- SENT → green
- QUEUED → yellow
- FAILED → red

**Empty state:** "No notifications have been sent for this appointment."

---

#### Tab 5: Financial

**Components:**
- `FinancialEntriesTable` – financial entries linked to this appointment
- Columns: type, amount, status, effective_at, approved_by
- Accessible only to AM and OP roles

**Permission gate:** If role is CL_ADMIN or CL_USER, tab is hidden entirely (not disabled, hidden).

---

### 4.4 Import Appointments (`/appointments/import`)

**Layout template:** `MainLayout` with centered card (max-width 900px).

**Steps (wizard):**
1. Upload
2. Preview
3. Confirm & Import
4. Result

**Step 1 – Upload:**
- `FileDropzone` component – drag-and-drop or click to select
- Accepts: `.xlsx` only (MIME: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
- Max file size: 5 MB
- Max rows: 1000
- Download template link: `GET /v1/appointments/import/template`

**Step 2 – Preview:**
- Calls `POST /v1/appointments/import/preview` with multipart form data
- Shows `ImportPreviewTable` with parsed rows
- Rows with errors highlighted in red; warnings in yellow
- Error/warning details shown in expandable row
- "Cancel" button returns to step 1
- "Proceed to Import" disabled if any ERROR rows exist (warnings allowed)

**Step 3 – Confirm & Import:**
- Summary: total rows, accepted, warnings, errors
- "Import X appointments" confirmation button
- Calls `POST /v1/appointments/import`

**Step 4 – Result:**
- Success: "X appointments created successfully"
- Partial success: shows error detail per row
- "View Appointments" navigates to filtered list

**States:**

| State | UI behavior |
|---|---|
| Upload loading | Spinner during parse |
| Upload error (invalid file) | Inline file rejection error |
| Parse error (server) | Error banner with detail |
| Import in progress | Progress bar (polling `GET /v1/appointments/import/:jobId/status`) |
| Import complete | Result summary |

---

## 5. Components

### `AppointmentStatusChip`

```typescript
interface AppointmentStatusChipProps {
  status: AppointmentStatus;
  size?: 'sm' | 'md';
}
```

**Color mapping:**

| Status | Background | Text | Icon |
|---|---|---|---|
| DRAFT | gray-100 | gray-600 | circle-dashed |
| AWAITING_INSPECTOR | blue-100 | blue-700 | clock |
| SCHEDULED | green-100 | green-700 | calendar-check |
| DONE | emerald-700 | white | check-circle (filled) |
| CANCELLED | red-100 | red-500 (muted) | x-circle |
| REJECTED | red-100 | red-700 | ban |

---

### `TenantConfirmationChip`

```typescript
interface TenantConfirmationChipProps {
  status: TenantConfirmationStatus;
  size?: 'sm' | 'md';
}
```

**Color mapping:**

| Status | Background | Text |
|---|---|---|
| PENDING | yellow-100 | yellow-700 |
| CONFIRMED | green-100 | green-700 |
| UNAVAILABLE | red-100 | red-700 |
| NO_RESPONSE | gray-100 | gray-600 |

---

### `StatusTransitionButton`

```typescript
interface StatusTransitionButtonProps {
  currentStatus: AppointmentStatus;
  targetStatus: AppointmentStatus;
  label: string;
  variant: 'primary' | 'danger' | 'secondary';
  requiresReason: boolean;
  requiresCrossCheck?: boolean; // for SCHEDULED → DONE
  onConfirm: (payload: TransitionAppointmentPayload) => Promise<void>;
  disabled?: boolean;
}
```

Renders a button. On click, opens `TransitionConfirmModal`. Only renders if the transition is valid for the current user role (derived from `useAuthContext()`).

---

### `TransitionConfirmModal`

```typescript
interface TransitionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: AppointmentStatus;
  targetStatus: AppointmentStatus;
  requiresReason: boolean;
  requiresCrossCheck?: boolean;
  onConfirm: (payload: TransitionAppointmentPayload) => Promise<void>;
  isLoading: boolean;
}
```

**Behavior:**
- Title: "Confirm: [action label]"
- Body: description of transition consequence
- Reason field: shown when `requiresReason=true`; required before submit enabled
  - For CANCELLED: dropdown with predefined reasons + "Other" free text
  - For REJECTED: dropdown with predefined reasons + "Other" free text
  - For DONE→DRAFT: mandatory free text
- Cross-check section: when `requiresCrossCheck=true`, operator must select themselves as confirming user
- Confirm button: disabled until required fields filled
- Destructive transitions (CANCEL, REJECT): confirm button is red

**Predefined cancellation reasons:**
- "Client request"
- "Property not accessible"
- "Tenant not available"
- "Inspector no-show"
- "Duplicate booking"
- "Other"

**Predefined rejection reasons:**
- "Property unsafe"
- "Incorrect address"
- "Out of service area"
- "Duplicate"
- "Other"

---

### `AppointmentFiltersBar`

```typescript
interface AppointmentFiltersBarProps {
  filters: AppointmentFilters;
  onChange: (filters: AppointmentFilters) => void;
  onClear: () => void;
  branches: BranchSummary[];
  inspectors?: InspectorSummary[]; // only passed for AM/OP
}
```

---

### `PropertySearch`

```typescript
interface PropertySearchProps {
  branchId: string | null;
  value: PropertySummary | null;
  onChange: (property: PropertySummary | null) => void;
  onCreateNew: () => void; // opens inline create modal
  error?: string;
  disabled?: boolean;
}
```

Async combobox. Minimum 3 characters before search fires. Debounced 300ms. Calls `GET /v1/properties?search=&branchId=`.

---

### `PricingPreview`

```typescript
interface PricingPreviewProps {
  branchId: string | null;
  serviceType: ServiceType | null;
}
```

Internal query: `GET /v1/pricing-rules?branchId=&serviceType=`. Shows "—" for each field while loading, warning card if no rule found.

---

### `AuditTimeline`

```typescript
interface AuditTimelineProps {
  entries: AuditLogEntry[];
  isLoading: boolean;
}
```

Vertical stepper list. Each entry: colored dot (based on action type), timestamp (relative + absolute on hover), actor badge, action description, optional reason text.

---

### `ImportPreviewTable`

```typescript
interface ImportPreviewTableProps {
  rows: ImportRow[];
  onBack: () => void;
  onProceed: () => void;
  isProceedDisabled: boolean;
}
```

---

## 6. API Integration

### Endpoints

```typescript
// List appointments
GET /v1/appointments
Query: AppointmentFilters
Response: PaginatedAppointments

// Get single appointment
GET /v1/appointments/:id
Response: Appointment

// Create appointment
POST /v1/appointments
Body: CreateAppointmentPayload
Headers: { 'Idempotency-Key': string }
Response: Appointment

// Update appointment
PATCH /v1/appointments/:id
Body: UpdateAppointmentPayload
Response: Appointment

// Transition status
POST /v1/appointments/:id/transition
Body: TransitionAppointmentPayload
Headers: { 'Idempotency-Key': string }
Response: Appointment

// Audit log
GET /v1/appointments/:id/audit-log
Response: AuditLogEntry[]

// Notification log
GET /v1/appointments/:id/notifications
Response: NotificationLogEntry[]

// Financial entries (appointment-level)
GET /v1/appointments/:id/financial-entries
Response: FinancialEntry[]

// Export XLSX
GET /v1/appointments/export
Query: AppointmentFilters (same as list)
Response: Blob (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

// Import template download
GET /v1/appointments/import/template
Response: Blob

// Import preview
POST /v1/appointments/import/preview
Body: FormData { file: File }
Response: ImportResult

// Import execute
POST /v1/appointments/import
Body: FormData { file: File }
Headers: { 'Idempotency-Key': string }
Response: { jobId: string }

// Import job status
GET /v1/appointments/import/:jobId/status
Response: { status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'; result?: ImportResult; error?: string }
```

### React Query Hooks

```typescript
// List hook
function useAppointments(filters: AppointmentFilters) {
  return useQuery({
    queryKey: ['appointments', 'list', filters],
    queryFn: () => appointmentsApi.list(filters),
    keepPreviousData: true,
    staleTime: 30_000,
  });
}

// Detail hook
function useAppointment(id: string) {
  return useQuery({
    queryKey: ['appointments', 'detail', id],
    queryFn: () => appointmentsApi.getById(id),
    staleTime: 10_000,
    enabled: !!id,
  });
}

// Audit log hook
function useAppointmentAuditLog(id: string) {
  return useQuery({
    queryKey: ['appointments', 'audit-log', id],
    queryFn: () => appointmentsApi.getAuditLog(id),
    enabled: !!id,
  });
}

// Notification log hook
function useAppointmentNotifications(id: string) {
  return useQuery({
    queryKey: ['appointments', 'notifications', id],
    queryFn: () => appointmentsApi.getNotifications(id),
    enabled: !!id,
  });
}

// Create mutation
function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAppointmentPayload) =>
      appointmentsApi.create(payload, generateIdempotencyKey()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'list'] });
      queryClient.setQueryData(['appointments', 'detail', data.id], data);
    },
  });
}

// Transition mutation
function useTransitionAppointment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TransitionAppointmentPayload) =>
      appointmentsApi.transition(id, payload, generateIdempotencyKey()),
    onSuccess: (data) => {
      queryClient.setQueryData(['appointments', 'detail', id], data);
      queryClient.invalidateQueries({ queryKey: ['appointments', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['appointments', 'audit-log', id] });
    },
  });
}

// Update mutation
function useUpdateAppointment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAppointmentPayload) =>
      appointmentsApi.update(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['appointments', 'detail', id], data);
    },
  });
}

// Export function (not a query, triggers download)
function useExportAppointments() {
  return useMutation({
    mutationFn: (filters: AppointmentFilters) =>
      appointmentsApi.exportXlsx(filters),
    onSuccess: (blob) => {
      downloadBlob(blob, `appointments-export-${Date.now()}.xlsx`);
    },
  });
}
```

### Idempotency Key

```typescript
// Generate a UUID-based idempotency key
function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
```

---

## 7. Business Rules in Frontend

### State Machine Transitions (UI-visible)

The following transitions are available as action buttons on the Detail page header. Each button only renders if the current user role satisfies the actor requirement AND the appointment's current status matches the `from` state.

| From | To | Label | Roles | Reason required | Modal type |
|---|---|---|---|---|---|
| DRAFT | AWAITING_INSPECTOR | "Release to Inspectors" | AM, OP | No | Simple confirm |
| DRAFT | CANCELLED | "Cancel" | AM, OP, CL_ADMIN | Yes (dropdown) | Reason + confirm |
| DRAFT | REJECTED | "Reject" | AM, OP | Yes (dropdown) | Reason + confirm |
| AWAITING_INSPECTOR | CANCELLED | "Cancel" | AM, OP, CL_ADMIN | Yes (dropdown) | Reason + confirm |
| SCHEDULED | DONE | "Mark as Done" | AM, OP | No (but cross-check) | Cross-check modal |
| SCHEDULED | CANCELLED | "Cancel" | AM, OP, CL_ADMIN | Yes (dropdown) | Reason + confirm |
| SCHEDULED | REJECTED | "Reject" | AM, OP | Yes (dropdown) | Reason + confirm |
| DONE | DRAFT | "Reopen" | AM only | Yes (free text) | Danger confirm |
| REJECTED | DRAFT | "Reset to Draft" | AM, OP | Yes (free text) | Confirm + reason |
| CANCELLED | DRAFT | "Reset to Draft" | AM, OP | Yes (free text) | Confirm + reason |

### Form Validations (Create form)

- `scheduledDate`: Must be >= today (client-side); backend enforces business calendar
- `tenantEmail` OR `tenantPhone`: At least one must be provided
- `tenantEmail`: RFC 5322 format if provided
- `tenantPhone`: Australian phone regex `^(\+61|0)[2-9]\d{8}$` if provided
- `timeSlot`: Must match pattern `HH:MM-HH:MM` and be from available slots list

### Role-based Visibility

```typescript
// Transition button visibility
function canTransition(role: string, from: AppointmentStatus, to: AppointmentStatus): boolean {
  const rules: Record<string, [AppointmentStatus, AppointmentStatus][]> = {
    AM: [
      ['DRAFT', 'AWAITING_INSPECTOR'],
      ['DRAFT', 'CANCELLED'],
      ['DRAFT', 'REJECTED'],
      ['AWAITING_INSPECTOR', 'CANCELLED'],
      ['SCHEDULED', 'DONE'],
      ['SCHEDULED', 'CANCELLED'],
      ['SCHEDULED', 'REJECTED'],
      ['DONE', 'DRAFT'],
      ['REJECTED', 'DRAFT'],
      ['CANCELLED', 'DRAFT'],
    ],
    OP: [
      ['DRAFT', 'AWAITING_INSPECTOR'],
      ['DRAFT', 'CANCELLED'],
      ['DRAFT', 'REJECTED'],
      ['AWAITING_INSPECTOR', 'CANCELLED'],
      ['SCHEDULED', 'DONE'],
      ['SCHEDULED', 'CANCELLED'],
      ['SCHEDULED', 'REJECTED'],
      ['REJECTED', 'DRAFT'],
      ['CANCELLED', 'DRAFT'],
    ],
    CL_ADMIN: [
      ['DRAFT', 'CANCELLED'],
      ['AWAITING_INSPECTOR', 'CANCELLED'],
      ['SCHEDULED', 'CANCELLED'],
    ],
    CL_USER: [], // no transitions
  };
  return (rules[role] ?? []).some(([f, t]) => f === from && t === to);
}
```

### Financial Tab Visibility
- Tab is visible ONLY for roles: AM, OP
- For CL_ADMIN / CL_USER: tab does not appear in the tab list

### Import Access
- Only AM and OP may access `/appointments/import`
- CL roles do not see the "Import" button in the list page header

---

## 8. UX Rules

### Navigation Flows

- After successful **Create**: navigate to `/appointments/:newId`, show success toast "Appointment created"
- After successful **Status Transition**: stay on `/appointments/:id`, update status badge in place, show success toast "Status updated to [status]"
- After **Cancel** navigation from Create form: navigate back to `/appointments` with no toast
- After successful **Import**: navigate to `/appointments?status=DRAFT&importBatch=:jobId`

### Destructive Confirmations

- "Cancel" and "Reject" transitions always require modal confirmation
- "Reopen DONE" (AM-only) uses a danger-styled modal with red confirm button and mandatory reason
- "Reset to Draft" after CANCELLED/REJECTED: styled as warning (amber) confirm modal

### Modals

- All transition modals are rendered via a `<Modal>` portal at the app root
- Backdrop click does NOT dismiss (user must explicitly cancel) to prevent accidental dismissal
- ESC key DOES dismiss the modal
- Focus trap: focus is locked inside the modal while open

### Success/Error Feedback

- Success toasts: green, top-right, auto-dismiss after 4 seconds
- Error toasts: red, top-right, persists until dismissed (user must close)
- Inline form errors: below each field, red text
- Global API errors (500, network): red banner at top of page

### Responsive Behavior

- List page: table collapses to card list on mobile (< 768px)
  - Each card shows: date, address, status chip, quick action menu (3-dot)
- Create form: single-column stacked layout on mobile
- Detail page: tabs become a scrollable tab list on mobile; header actions collapse into a dropdown
- Import page: not optimized for mobile (AM/OP is desktop-primary workflow)

### Empty State Illustration

- No appointments at all: illustration of empty calendar + "Create your first appointment" button
- No appointments matching filters: magnifying glass illustration + "No results found. Try adjusting your filters."

### Export Button Behavior

- Clicking Export immediately triggers download
- If filters are active, export respects those filters
- Button shows spinner while generating (mutationFn loading state)
- On error: toast "Export failed. Please try again."

### Table Row Click

- Clicking anywhere on a table row navigates to `/appointments/:id`
- Actions column menu does not propagate click to row (stopPropagation)

### Date Display

- List: "Mon 15 Mar 2026"
- Detail header: "Monday, 15 March 2026 · 09:00–11:00"
- Audit timeline: relative time ("2 hours ago") + absolute on hover ("15 Mar 2026, 14:32")
