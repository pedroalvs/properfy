# Service Groups – Web Feature Spec

> Portal: Master Admin / Operator (apps/web)
> Last updated: 2026-03-15

---

## 1. Overview

Service Groups are the mechanism for batching multiple `AWAITING_INSPECTOR` appointments into a single offer that inspectors can accept via the Marketplace. An operator creates a group by selecting eligible appointments, sets a time window, and publishes it. The first inspector to accept the group in the PWA wins the batch. This spec covers the web-side management interface (create, view, publish, manually assign, cancel).

**Portal:** Master Admin (roles: AM, OP)

**Pages/screens:**
1. Service Groups List (`/service-groups`)
2. Create Service Group (`/service-groups/new`)
3. Service Group Detail (`/service-groups/:id`)
4. Manual Assign modal (accessible from detail page)

---

## 2. Pages & Routes

| Path | Component | Portal | Description |
|---|---|---|---|
| `/service-groups` | `ServiceGroupsListPage` | Master Admin | Filterable list of groups |
| `/service-groups/new` | `ServiceGroupCreatePage` | Master Admin | Wizard to create a group |
| `/service-groups/:id` | `ServiceGroupDetailPage` | Master Admin | Detail + actions |

Access guard:

```tsx
<Route path="/service-groups" element={<AuthGuard roles={['AM','OP']}><ServiceGroupsListPage /></AuthGuard>} />
<Route path="/service-groups/new" element={<AuthGuard roles={['AM','OP']}><ServiceGroupCreatePage /></AuthGuard>} />
<Route path="/service-groups/:id" element={<AuthGuard roles={['AM','OP']}><ServiceGroupDetailPage /></AuthGuard>} />
```

---

## 3. TypeScript Interfaces

```typescript
// Service group status enum
type ServiceGroupStatus = 'DRAFT' | 'PUBLISHED' | 'ACCEPTED' | 'CANCELLED';

// Priority mode enum
type PriorityMode = 'FIRST_ACCEPT' | 'MANUAL';

// Service type (reuse from appointments spec)
type ServiceType = 'ROUTINE' | 'INGOING' | 'OUTGOING' | 'VACATE' | 'MAINTENANCE';

// Summary of an appointment inside a group
interface GroupedAppointmentSummary {
  id: string;
  scheduledDate: string;
  timeSlot: string;
  property: {
    id: string;
    propertyCode: string;
    streetAddress: string;
    suburb: string;
    postcode: string;
    state: string;
    latitude: number | null;
    longitude: number | null;
  };
  serviceType: ServiceType;
  tenantConfirmationStatus: TenantConfirmationStatus;
  branch: { id: string; name: string };
}

// Inspector assigned to the group
interface AssignedInspector {
  id: string;
  fullName: string;
  phone: string;
  email: string;
}

// Full service group entity
interface ServiceGroup {
  id: string;
  status: ServiceGroupStatus;
  serviceType: ServiceType;
  scheduledDate: string;           // "YYYY-MM-DD" – all appointments share this date
  timeWindowStart: string;         // "HH:MM"
  timeWindowEnd: string;           // "HH:MM"
  priorityMode: PriorityMode;
  groupSize: number;               // number of appointments in group
  offeredCount: number;            // how many times pushed to marketplace
  confirmedCount: number;          // appointments with CONFIRMED tenant status
  regionSummary: string;           // e.g. "Brunswick, Fitzroy, Collingwood"
  assignedInspector: AssignedInspector | null;
  acceptedAt: string | null;
  appointments: GroupedAppointmentSummary[];
  createdAt: string;
  updatedAt: string;
  cancelReason: string | null;
}

// List item (lighter payload)
interface ServiceGroupListItem {
  id: string;
  status: ServiceGroupStatus;
  serviceType: ServiceType;
  scheduledDate: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  regionSummary: string;
  assignedInspector: Pick<AssignedInspector, 'id' | 'fullName'> | null;
  createdAt: string;
}

// Paginated list response
interface PaginatedServiceGroups {
  data: ServiceGroupListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// List filters
interface ServiceGroupFilters {
  status?: ServiceGroupStatus[];
  serviceType?: ServiceType;
  scheduledDateFrom?: string;
  scheduledDateTo?: string;
  inspectorId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'scheduledDate' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// Create payload
interface CreateServiceGroupPayload {
  appointmentIds: string[];        // 5–25 items, all same serviceType + same scheduledDate
  timeWindowStart: string;         // "HH:MM"
  timeWindowEnd: string;           // "HH:MM"
  priorityMode: PriorityMode;
}

// Manual assign payload
interface ManualAssignPayload {
  inspectorId: string;
}

// Cancel payload
interface CancelServiceGroupPayload {
  reason: string;
}

// Eligible appointments query response (for create wizard)
interface EligibleAppointmentsResponse {
  data: GroupedAppointmentSummary[];
  // Note: These are AWAITING_INSPECTOR appointments not yet in any group
}

// Reuse
type TenantConfirmationStatus = 'PENDING' | 'CONFIRMED' | 'UNAVAILABLE' | 'NO_RESPONSE';
```

---

## 4. Screens

### 4.1 Service Groups List (`/service-groups`)

**Layout template:** `MainLayout` with full-width table panel.

**Components used:**
- `ServiceGroupFiltersBar`
- `ServiceGroupTable`
- `ServiceGroupStatusChip`
- `Pagination`
- `CreateGroupButton` – header CTA

**Data consumed:**
```
GET /v1/service-groups?status=&serviceType=&scheduledDateFrom=&scheduledDateTo=&inspectorId=&page=&pageSize=
→ PaginatedServiceGroups
```

**React Query key:**
```typescript
['service-groups', 'list', filters]
```

**States:**

| State | UI behavior |
|---|---|
| Loading | Skeleton rows (8) |
| Empty (no filter) | Empty illustration + "Create your first service group" |
| Empty (filtered) | "No groups match your filters." + clear link |
| Error | Error banner + retry |

**Table columns:**

| Column | Sortable | Notes |
|---|---|---|
| Scheduled Date | Y | "Mon 15 Mar" |
| Time Window | N | "09:00 – 11:00" |
| Service Type | N | Badge |
| Region | N | regionSummary (truncated to 40 chars with tooltip) |
| Group Size | N | Number (appointments count) |
| Confirmations | N | "3/5" (confirmedCount/groupSize) |
| Status | Y | `ServiceGroupStatusChip` |
| Inspector | N | fullName or "—" |
| Actions | N | "View" button |

**Filter bar:**
- Multi-select status
- Service type select
- Date range picker (scheduledDateFrom / scheduledDateTo)
- Inspector select (async combobox)
- "Clear Filters" button

---

### 4.2 Create Service Group (`/service-groups/new`)

**Layout template:** `MainLayout` with 2-step wizard card (max-width 1000px).

**Steps:**
1. Select Appointments
2. Configure Group Settings

---

#### Step 1: Select Appointments

**Purpose:** Choose the `AWAITING_INSPECTOR` appointments to bundle into the group.

**Components used:**
- `ServiceTypeFilter` – filter appointments by service type (required before loading)
- `ScheduledDateFilter` – filter by date (required before loading)
- `EligibleAppointmentsTable` – selectable table of eligible appointments
- `SelectionCounter` – shows "X selected (min 5, max 25)"

**Data consumed:**
```
GET /v1/appointments?status=AWAITING_INSPECTOR&serviceType=&scheduledDate=&notInGroup=true&pageSize=100
→ PaginatedAppointments (shows GroupedAppointmentSummary shape)
```

**React Query key:**
```typescript
['appointments', 'eligible-for-group', { serviceType, scheduledDate }]
```

**Rules enforced in UI:**
- Service type and date must be selected before appointments load
- All selected appointments MUST share the same serviceType and scheduledDate (enforced by filter locking – once you pick serviceType + date, the filter is locked)
- Minimum selection: 5 appointments
- Maximum selection: 25 appointments
- "Next" button disabled until selection is valid (5–25 items)

**Eligible appointments table columns:**
- Checkbox (select)
- Date
- Time slot
- Address (streetAddress + suburb)
- Service type
- Tenant confirmation chip
- Branch

**Empty state:** "No eligible appointments for the selected date and service type."

---

#### Step 2: Configure Group Settings

**Components used:**
- `TimeWindowPicker` – start + end time inputs ("HH:MM" format)
- `PriorityModeSelect` – "First Accept" or "Manual Assign"
- `GroupSummaryCard` – read-only preview of selected appointments
- `FormActions` – "Back" + "Create Group" buttons

**Form fields and validations:**

| Field | Required | Validation |
|---|---|---|
| Time Window Start | Yes | Valid "HH:MM", must be >= 06:00 |
| Time Window End | Yes | Valid "HH:MM", must be > timeWindowStart, must be <= 20:00 |
| Priority Mode | Yes | FIRST_ACCEPT or MANUAL |

**On submit:**
- POST `/v1/service-groups` with `CreateServiceGroupPayload`
- On success: redirect to `/service-groups/:newId` with toast "Service group created"
- On error: show inline error banner on step 2

**States:**

| State | UI behavior |
|---|---|
| Submitting | Button spinner, fields disabled |
| Success | Navigate to detail |
| Server error | Error banner on step 2 |

---

### 4.3 Service Group Detail (`/service-groups/:id`)

**Layout template:** `MainLayout` with header + two sections (group info + appointments list).

**Header section:**
- Group ID (truncated)
- Service type badge + scheduled date
- Status chip (`ServiceGroupStatusChip`)
- Action buttons (contextual by status + role)

**Sections:**
1. Group info card
2. Appointments table
3. Inspector assignment panel (when ACCEPTED)

**Data consumed:**
```
GET /v1/service-groups/:id → ServiceGroup
```

**React Query key:**
```typescript
['service-groups', 'detail', id]
```

**States (page-level):**

| State | UI behavior |
|---|---|
| Loading | Full-page skeleton |
| Not found | 404 card |
| Error | Error card + retry |

---

#### Group Info Card

Fields displayed:
- Status chip
- Scheduled date
- Time window ("09:00 – 11:00")
- Service type
- Priority mode
- Region summary
- Group size
- Offered count (how many times published to marketplace)
- Confirmed count (appointments with CONFIRMED tenant)

---

#### Appointments Table

Columns:
- Property code + address
- Service type
- Tenant confirmation chip
- Branch
- "View Appointment" link → `/appointments/:id`

Read-only. All appointments in the group are listed here.

---

#### Inspector Assignment Panel

Visible when `assignedInspector` is not null (status: ACCEPTED):
- Inspector name, phone, email
- Accepted at timestamp

---

#### Action Buttons (contextual by status)

| Status | Available Actions | Roles |
|---|---|---|
| DRAFT | Publish, Cancel | AM, OP |
| PUBLISHED | Assign Manually, Cancel | AM, OP |
| ACCEPTED | Cancel | AM, OP |
| CANCELLED | — | — |

**Publish action:**
- Button: "Publish to Marketplace"
- Simple confirm modal: "This will make the group visible to all available inspectors."
- On confirm: `POST /v1/service-groups/:id/publish`

**Assign Manually action:**
- Opens `ManualAssignModal`
- Inspector search (async combobox)
- Confirm button → `POST /v1/service-groups/:id/assign` with `{ inspectorId }`

**Cancel action:**
- Opens `CancelGroupModal`
- Requires reason (free text, max 500 chars)
- `POST /v1/service-groups/:id/cancel` with `{ reason }`
- Warning: "Cancelling this group will NOT cancel the individual appointments. They will return to AWAITING_INSPECTOR status."

---

## 5. Components

### `ServiceGroupStatusChip`

```typescript
interface ServiceGroupStatusChipProps {
  status: ServiceGroupStatus;
  size?: 'sm' | 'md';
}
```

**Color mapping:**

| Status | Background | Text | Icon |
|---|---|---|---|
| DRAFT | gray-100 | gray-600 | circle-dashed |
| PUBLISHED | blue-100 | blue-700 | send |
| ACCEPTED | green-100 | green-700 | user-check |
| CANCELLED | red-100 | red-500 | x-circle |

---

### `EligibleAppointmentsTable`

```typescript
interface EligibleAppointmentsTableProps {
  appointments: GroupedAppointmentSummary[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading: boolean;
  maxSelection?: number; // default 25
  minSelection?: number; // default 5
}
```

**Behavior:**
- Checkbox in header selects/deselects all (up to maxSelection)
- When maxSelection reached, remaining checkboxes are disabled with tooltip "Maximum 25 appointments per group"
- Selection count displayed below table: "X of 25 selected"

---

### `SelectionCounter`

```typescript
interface SelectionCounterProps {
  selected: number;
  min: number;
  max: number;
}
```

Renders: "5 selected (minimum 5, maximum 25)" – colored red if below min, green if in range.

---

### `TimeWindowPicker`

```typescript
interface TimeWindowPickerProps {
  startTime: string;
  endTime: string;
  onStartChange: (time: string) => void;
  onEndChange: (time: string) => void;
  errors?: { start?: string; end?: string };
}
```

Two `<input type="time">` elements with labels "Window Start" and "Window End".

---

### `PriorityModeSelect`

```typescript
interface PriorityModeSelectProps {
  value: PriorityMode;
  onChange: (mode: PriorityMode) => void;
}
```

Radio group or select:
- "First Accept" – first inspector to accept wins
- "Manual Assign" – operator manually assigns inspector after publishing

---

### `ManualAssignModal`

```typescript
interface ManualAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  onSuccess: (updated: ServiceGroup) => void;
}
```

Contains:
- `InspectorSearch` combobox (async, `GET /v1/inspectors?search=`)
- Selected inspector preview card (name, phone, current workload indicator)
- "Assign" button (disabled until inspector selected)

---

### `CancelGroupModal`

```typescript
interface CancelGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupStatus: ServiceGroupStatus;
  onSuccess: () => void;
}
```

---

### `ServiceGroupFiltersBar`

```typescript
interface ServiceGroupFiltersBarProps {
  filters: ServiceGroupFilters;
  onChange: (filters: ServiceGroupFilters) => void;
  onClear: () => void;
}
```

---

### `GroupSummaryCard`

```typescript
interface GroupSummaryCardProps {
  selectedAppointments: GroupedAppointmentSummary[];
  serviceType: ServiceType;
  scheduledDate: string;
}
```

Read-only summary shown in wizard step 2. Shows: service type, date, appointment count, list of suburbs covered.

---

## 6. API Integration

### Endpoints

```typescript
// List service groups
GET /v1/service-groups
Query: ServiceGroupFilters
Response: PaginatedServiceGroups

// Get service group detail
GET /v1/service-groups/:id
Response: ServiceGroup

// Create service group
POST /v1/service-groups
Body: CreateServiceGroupPayload
Response: ServiceGroup

// Publish service group
POST /v1/service-groups/:id/publish
Body: {}
Response: ServiceGroup

// Manual assign inspector
POST /v1/service-groups/:id/assign
Body: ManualAssignPayload
Response: ServiceGroup

// Cancel service group
POST /v1/service-groups/:id/cancel
Body: CancelServiceGroupPayload
Response: ServiceGroup

// List eligible appointments (for create wizard)
GET /v1/appointments?status=AWAITING_INSPECTOR&notInGroup=true&serviceType=&scheduledDate=&pageSize=100
Response: PaginatedAppointments
```

### React Query Hooks

```typescript
// List hook
function useServiceGroups(filters: ServiceGroupFilters) {
  return useQuery({
    queryKey: ['service-groups', 'list', filters],
    queryFn: () => serviceGroupsApi.list(filters),
    keepPreviousData: true,
    staleTime: 30_000,
  });
}

// Detail hook
function useServiceGroup(id: string) {
  return useQuery({
    queryKey: ['service-groups', 'detail', id],
    queryFn: () => serviceGroupsApi.getById(id),
    enabled: !!id,
    staleTime: 15_000,
  });
}

// Eligible appointments hook (step 1 of wizard)
function useEligibleAppointments(
  serviceType: ServiceType | null,
  scheduledDate: string | null
) {
  return useQuery({
    queryKey: ['appointments', 'eligible-for-group', { serviceType, scheduledDate }],
    queryFn: () => appointmentsApi.list({
      status: ['AWAITING_INSPECTOR'],
      serviceType: serviceType!,
      dateFrom: scheduledDate!,
      dateTo: scheduledDate!,
      pageSize: 100,
    }),
    enabled: !!serviceType && !!scheduledDate,
    staleTime: 30_000,
  });
}

// Create mutation
function useCreateServiceGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateServiceGroupPayload) =>
      serviceGroupsApi.create(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['service-groups', 'list'] });
      queryClient.setQueryData(['service-groups', 'detail', data.id], data);
    },
  });
}

// Publish mutation
function usePublishServiceGroup(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serviceGroupsApi.publish(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['service-groups', 'detail', id], data);
      queryClient.invalidateQueries({ queryKey: ['service-groups', 'list'] });
    },
  });
}

// Manual assign mutation
function useAssignInspector(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ManualAssignPayload) =>
      serviceGroupsApi.assign(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['service-groups', 'detail', id], data);
    },
  });
}

// Cancel mutation
function useCancelServiceGroup(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CancelServiceGroupPayload) =>
      serviceGroupsApi.cancel(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['service-groups', 'detail', id], data);
      queryClient.invalidateQueries({ queryKey: ['service-groups', 'list'] });
    },
  });
}
```

---

## 7. Business Rules in Frontend

### Group Creation Constraints

- Minimum 5, maximum 25 appointments per group
- All selected appointments must share the same `serviceType`
- All selected appointments must share the same `scheduledDate`
- All selected appointments must have status `AWAITING_INSPECTOR`
- An appointment cannot be in more than one active group (enforced server-side; surface 409 as inline error)

These constraints are enforced in the wizard UI by:
1. Locking the service type + date filter once selected (user must go back to change)
2. Disabling extra checkboxes when max (25) is reached
3. "Next" button disabled until selection count is in [5, 25]

### Status Transition Rules

| Action | From Status | To Status | Allowed Roles |
|---|---|---|---|
| Publish | DRAFT | PUBLISHED | AM, OP |
| Manual Assign | PUBLISHED | ACCEPTED | AM, OP |
| Cancel | DRAFT, PUBLISHED, ACCEPTED | CANCELLED | AM, OP |

Cancelling a group does NOT cascade-cancel its appointments. Appointments return to `AWAITING_INSPECTOR` independently.

### Published Group Behavior

- Once PUBLISHED, the group appears in the Inspector PWA Marketplace
- The group remains PUBLISHED until an inspector accepts (→ ACCEPTED) or operator cancels (→ CANCELLED)
- `offeredCount` increments each time the group is pushed/re-published to the marketplace

### Manual Assign vs First Accept

- `FIRST_ACCEPT`: group auto-transitions to ACCEPTED when any inspector accepts via marketplace
- `MANUAL`: group is published as a broadcast but acceptance is disabled in PWA; operator assigns inspector via `ManualAssignModal`

### Race Condition Handling

If two operators try to assign different inspectors simultaneously:
- Server accepts the first request; second returns 409
- Show error toast: "This group was already assigned to another inspector."
- Refresh detail page data

---

## 8. UX Rules

### Navigation Flows

- After successful **Create**: navigate to `/service-groups/:newId`, toast "Service group created"
- After **Publish**: stay on detail page, status badge updates to PUBLISHED, toast "Group published to marketplace"
- After **Manual Assign**: close modal, inspector panel appears, toast "Inspector assigned"
- After **Cancel**: stay on detail page, status updates to CANCELLED, toast "Group cancelled"
- Wizard "Cancel" button: confirm modal "Discard group?" → navigate to `/service-groups`

### Wizard Navigation

- Step indicator at top: "Step 1 of 2 – Select Appointments" / "Step 2 of 2 – Configure"
- "Back" button on step 2 returns to step 1 with selections preserved
- Navigating away from wizard mid-flow: browser `beforeunload` prompt "You have unsaved changes"

### Destructive Confirmations

- Cancel group: modal with reason field + red "Cancel Group" button
  - Warning text in modal: "The appointments in this group will return to 'Awaiting Inspector' status."
- Publish: simple confirm (non-destructive, no special styling)

### Success/Error Feedback

- All success actions: green toast, 4 seconds
- All error actions: red persistent toast
- Inline errors in wizard: below field

### Responsive Behavior

- List page: table on desktop, card list on mobile
  - Card shows: date, service type, status chip, group size, region
- Detail page: single column on mobile; group info + appointments stacked
- Create wizard: single column on mobile; step indicator collapses to "Step 1/2" text
- Eligible appointments table on mobile: horizontal scroll for columns

### Empty State – No Eligible Appointments

When step 1 shows no eligible appointments for the selected service type + date:
- Illustration of empty calendar
- Message: "There are no appointments awaiting an inspector for [ServiceType] on [Date]."
- Suggested action: "View Appointments" link → `/appointments?status=AWAITING_INSPECTOR`
