# Financial – Web Feature Spec

> Portal: Master Admin / Operator (apps/web)
> Last updated: 2026-03-15
>
> ⚠️ **Partially superseded.** The Inspector **Property Invoice** surface (list/detail/approve/reject/
> filters) is now specified by `specs/032-inspector-property-invoice/spec.md`. The admin
> "Generate Invoice" button + modal described below were removed in favour of the inspector-request →
> AM/OP approve/reject flow. This document survives only for the financial-entries ledger sections.

---

## 1. Overview

The Financial module provides operators and admin masters with visibility and control over the platform's financial flows: per-appointment financial entries (tenant debits, inspector payouts, adjustments, refunds) and inspector invoices (weekly/biweekly/monthly closing periods). All financial actions require elevated permissions (AM or OP only).

**Portal:** Master Admin (roles: AM, OP only)

**Pages/screens:**
1. Financial Entries List (`/financial/entries`)
2. Inspector Invoices List (`/financial/invoices`)
3. Generate Invoice (modal from invoices list)

---

## 2. Pages & Routes

| Path | Component | Portal | Description |
|---|---|---|---|
| `/financial/entries` | `FinancialEntriesPage` | Master Admin | All financial entries across appointments |
| `/financial/invoices` | `InvoicesPage` | Master Admin | Inspector invoice periods |
| `/financial/invoices/generate` | redirect to `/financial/invoices` + open modal | — | Generate invoice modal |

Route access:

```tsx
<Route path="/financial/entries" element={<AuthGuard roles={['AM','OP']}><FinancialEntriesPage /></AuthGuard>} />
<Route path="/financial/invoices" element={<AuthGuard roles={['AM','OP']}><InvoicesPage /></AuthGuard>} />
```

If a user with CL_ADMIN or CL_USER role attempts to access `/financial/*`, they are redirected to `/403`.

---

## 3. TypeScript Interfaces

```typescript
// Financial entry type
type FinancialEntryType =
  | 'TENANT_DEBIT'      // charge to agency for completed inspection
  | 'INSPECTOR_PAYOUT'  // payment to inspector
  | 'PLATFORM_FEE'      // platform margin retained
  | 'ADJUSTMENT'        // manual adjustment (add/subtract)
  | 'REFUND';           // refund to agency

// Financial entry status
type FinancialEntryStatus =
  | 'PENDING'           // not yet processed
  | 'APPROVED'          // approved by operator, ready for invoice
  | 'INVOICED'          // included in an invoice
  | 'CANCELLED';        // voided/cancelled

// Invoice status
type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

// Invoice period frequency
type InvoicePeriodFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

// Financial entry
interface FinancialEntry {
  id: string;
  appointmentId: string;
  appointment: {
    id: string;
    scheduledDate: string;
    property: {
      streetAddress: string;
      suburb: string;
    };
    serviceType: ServiceType;
    branch: { id: string; name: string };
  };
  type: FinancialEntryType;
  amount: number;              // in cents (AUD)
  currency: string;            // "AUD"
  status: FinancialEntryStatus;
  effectiveAt: string;         // ISO 8601 – when the charge/payout takes effect
  approvedByUserId: string | null;
  approvedByUser: { id: string; fullName: string } | null;
  approvedAt: string | null;
  invoiceId: string | null;
  inspectorId: string | null;
  inspector: { id: string; fullName: string } | null;
  tenantId: string;
  tenant: { id: string; name: string };
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Paginated financial entries
interface PaginatedFinancialEntries {
  data: FinancialEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Financial entry list filters
interface FinancialEntryFilters {
  type?: FinancialEntryType[];
  status?: FinancialEntryStatus[];
  inspectorId?: string;
  tenantId?: string;
  effectiveFrom?: string;   // "YYYY-MM-DD"
  effectiveTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'effectiveAt' | 'amount' | 'createdAt' | 'type';
  sortOrder?: 'asc' | 'desc';
}

// Inspector invoice
interface InspectorInvoice {
  id: string;
  inspectorId: string;
  inspector: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
  };
  periodStart: string;         // "YYYY-MM-DD"
  periodEnd: string;
  frequency: InvoicePeriodFrequency;
  status: InvoiceStatus;
  totalAmount: number;         // in cents
  currency: string;
  entriesCount: number;        // number of entries included
  sentAt: string | null;
  paidAt: string | null;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Paginated invoices
interface PaginatedInvoices {
  data: InspectorInvoice[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Invoice list filters
interface InvoiceFilters {
  inspectorId?: string;
  status?: InvoiceStatus[];
  periodFrom?: string;
  periodTo?: string;
  frequency?: InvoicePeriodFrequency;
  page?: number;
  pageSize?: number;
  sortBy?: 'periodStart' | 'totalAmount' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// Generate invoice payload
interface GenerateInvoicePayload {
  inspectorId: string;
  periodStart: string;   // "YYYY-MM-DD"
  periodEnd: string;     // "YYYY-MM-DD"
  frequency: InvoicePeriodFrequency;
  notes?: string;
}

// Manual adjustment payload
interface CreateAdjustmentPayload {
  appointmentId: string;
  amount: number;        // in cents, can be negative (deduction)
  type: 'ADJUSTMENT';
  notes: string;         // required for adjustments
  effectiveAt: string;   // "YYYY-MM-DD"
}

// Refund payload
interface CreateRefundPayload {
  appointmentId: string;
  amount: number;        // in cents, positive (credit back to agency)
  reason: string;        // required for refunds
  effectiveAt: string;
}

// Approve entry payload
interface ApproveEntryPayload {
  entryIds: string[];    // batch approval
}

// Reuse
type ServiceType = 'ROUTINE' | 'INGOING' | 'OUTGOING' | 'VACATE' | 'MAINTENANCE';
```

---

## 4. Screens

### 4.1 Financial Entries (`/financial/entries`)

**Layout template:** `MainLayout` with full-width table panel + summary stats bar at top.

**Components used:**
- `FinancialSummaryBar` – aggregate stats for current filter
- `FinancialEntryFiltersBar`
- `FinancialEntriesTable`
- `FinancialEntryTypeBadge`
- `FinancialEntryStatusChip`
- `AdjustmentModal`
- `RefundModal`
- `BatchApproveButton`
- `Pagination`

**Data consumed:**
```
GET /v1/financial/entries?type=&status=&inspectorId=&tenantId=&effectiveFrom=&effectiveTo=&page=&pageSize=
→ PaginatedFinancialEntries

GET /v1/financial/entries/summary?[same filters minus page/pageSize]
→ { totalDebits: number; totalPayouts: number; totalAdjustments: number; totalRefunds: number; pendingCount: number }
```

**React Query keys:**
```typescript
['financial', 'entries', 'list', filters]
['financial', 'entries', 'summary', filtersWithoutPagination]
```

**States:**

| State | UI behavior |
|---|---|
| Loading | Skeleton table (10 rows) + skeleton summary bar |
| Empty | "No financial entries match your filters." |
| Error | Error banner + retry |

**Summary bar:**
Displayed above the table, always showing totals for the current filter:
- Total Debits: $X,XXX.XX
- Total Payouts: $X,XXX.XX
- Total Adjustments: $X,XXX.XX
- Total Refunds: $X,XXX.XX
- Pending: X entries

**Table columns:**

| Column | Sortable | Notes |
|---|---|---|
| Appointment | N | Property address + date link → `/appointments/:id` |
| Type | N | `FinancialEntryTypeBadge` |
| Amount | Y | Formatted: $XXX.XX (red if REFUND/negative ADJUSTMENT) |
| Status | Y | `FinancialEntryStatusChip` |
| Effective Date | Y | "15 Mar 2026" |
| Inspector | N | fullName or "—" |
| Tenant | N | tenant.name |
| Approved By | N | approvedByUser.fullName or "—" |
| Actions | N | Contextual: Approve, Adjust, Refund |

**Filter bar:**
- Multi-select type (checkboxes: Tenant Debit, Inspector Payout, Adjustment, Refund)
- Multi-select status
- Inspector async combobox
- Tenant select
- Effective date range picker

**Batch actions:**
- Checkboxes on table rows
- "Approve Selected (X)" button activates when entries with status PENDING are checked
- Batch approve: `POST /v1/financial/entries/approve` with `{ entryIds: string[] }`

**Row actions:**

| Action | Visible when | Roles |
|---|---|---|
| Approve | status === PENDING | AM, OP |
| Adjust | status === PENDING or APPROVED | AM, OP |
| Refund | type === TENANT_DEBIT, status === APPROVED or INVOICED | AM, OP |

---

### 4.2 Inspector Invoices (`/financial/invoices`)

**Layout template:** `MainLayout` with full-width table panel + "Generate Invoice" button in header.

**Components used:**
- `InvoiceFiltersBar`
- `InvoicesTable`
- `InvoiceStatusChip`
- `GenerateInvoiceModal`
- `Pagination`

**Data consumed:**
```
GET /v1/financial/invoices?inspectorId=&status=&periodFrom=&periodTo=&frequency=&page=&pageSize=
→ PaginatedInvoices
```

**React Query key:**
```typescript
['financial', 'invoices', 'list', filters]
```

**States:**

| State | UI behavior |
|---|---|
| Loading | Skeleton rows (8) |
| Empty | "No invoices yet. Generate your first invoice." |
| Error | Error banner + retry |

**Table columns:**

| Column | Sortable | Notes |
|---|---|---|
| Inspector | N | fullName (link to inspector detail if applicable) |
| Period | Y | "15 Jan – 31 Jan 2026" |
| Frequency | N | Weekly / Biweekly / Monthly badge |
| Entries | N | entriesCount |
| Total Amount | Y | $X,XXX.XX |
| Status | Y | `InvoiceStatusChip` |
| Sent At | N | Date or "—" |
| Paid At | N | Date or "—" |
| Actions | N | View, Mark Paid, Download PDF |

**Filter bar:**
- Inspector async combobox
- Multi-select status
- Frequency select
- Period date range picker

**"Generate Invoice" button:** Opens `GenerateInvoiceModal`.

**Row actions:**

| Action | Visible when | Roles | Notes |
|---|---|---|---|
| View | always | AM, OP | Opens invoice detail modal |
| Mark Paid | status === SENT or OVERDUE | AM, OP | Simple confirm modal |
| Download PDF | always | AM, OP | `GET /v1/financial/invoices/:id/pdf` |
| Send | status === DRAFT | AM, OP | `POST /v1/financial/invoices/:id/send` |

---

## 5. Components

### `FinancialEntryTypeBadge`

```typescript
interface FinancialEntryTypeBadgeProps {
  type: FinancialEntryType;
  size?: 'sm' | 'md';
}
```

**Visual mapping:**

| Type | Background | Text | Label |
|---|---|---|---|
| TENANT_DEBIT | orange-100 | orange-700 | "Debit" |
| INSPECTOR_PAYOUT | blue-100 | blue-700 | "Payout" |
| PLATFORM_FEE | purple-100 | purple-700 | "Platform Fee" |
| ADJUSTMENT | yellow-100 | yellow-700 | "Adjustment" |
| REFUND | red-100 | red-700 | "Refund" |

---

### `FinancialEntryStatusChip`

```typescript
interface FinancialEntryStatusChipProps {
  status: FinancialEntryStatus;
  size?: 'sm' | 'md';
}
```

**Visual mapping:**

| Status | Background | Text |
|---|---|---|
| PENDING | yellow-100 | yellow-700 |
| APPROVED | green-100 | green-700 |
| INVOICED | blue-100 | blue-700 |
| CANCELLED | gray-100 | gray-500 |

---

### `InvoiceStatusChip`

```typescript
interface InvoiceStatusChipProps {
  status: InvoiceStatus;
  size?: 'sm' | 'md';
}
```

**Visual mapping:**

| Status | Background | Text |
|---|---|---|
| DRAFT | gray-100 | gray-600 |
| SENT | blue-100 | blue-700 |
| PAID | green-100 | green-700 |
| OVERDUE | red-100 | red-700 |
| CANCELLED | gray-100 | gray-500 (strikethrough) |

---

### `FinancialSummaryBar`

```typescript
interface FinancialSummaryBarProps {
  totalDebits: number;
  totalPayouts: number;
  totalAdjustments: number;
  totalRefunds: number;
  pendingCount: number;
  isLoading: boolean;
}
```

Renders a horizontal row of stat cards. All amounts formatted as AUD currency strings.

```typescript
function formatAUD(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}
```

---

### `AdjustmentModal`

```typescript
interface AdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentId: string;
  onSuccess: () => void;
}
```

**Form fields:**

| Field | Required | Validation |
|---|---|---|
| Amount | Yes | Non-zero number; can be negative (deduction); max abs value: $10,000 |
| Type toggle | N/A | Pre-set to ADJUSTMENT |
| Effective Date | Yes | Valid date, not in the future by more than 30 days |
| Notes | Yes | Min 10 chars, max 500 chars (reason is mandatory for adjustments) |

**Submit:** `POST /v1/financial/entries` with `CreateAdjustmentPayload`

---

### `RefundModal`

```typescript
interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryId: string;
  appointmentId: string;
  maxRefundAmount: number; // cents – typically the original TENANT_DEBIT amount
  onSuccess: () => void;
}
```

**Form fields:**

| Field | Required | Validation |
|---|---|---|
| Amount | Yes | Positive, max = maxRefundAmount |
| Reason | Yes | Min 10 chars, max 500 chars |
| Effective Date | Yes | Valid date |

**Refund requires 2nd approval:** After submitting the refund, the entry is created with status PENDING and requires a second operator/AM to approve it. Show info banner: "Refunds require approval from a second operator before processing."

**Submit:** `POST /v1/financial/entries` with `CreateRefundPayload`

---

### `GenerateInvoiceModal`

```typescript
interface GenerateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (invoice: InspectorInvoice) => void;
}
```

**Form fields:**

| Field | Required | Validation |
|---|---|---|
| Inspector | Yes | Async search combobox |
| Period Start | Yes | Valid date |
| Period End | Yes | Valid date, after periodStart |
| Frequency | Yes | WEEKLY / BIWEEKLY / MONTHLY |
| Notes | No | Max 500 chars |

**Preview section:** After inspector + period are filled, shows a live preview:
```
GET /v1/financial/invoices/preview?inspectorId=&periodStart=&periodEnd=
→ { eligibleEntriesCount: number; totalAmount: number; entries: FinancialEntry[] }
```

React Query key: `['financial', 'invoice-preview', { inspectorId, periodStart, periodEnd }]`

Preview updates on change of inspector/period fields (debounced 500ms).

Preview card shows:
- "X approved entries found"
- "Total: $X,XXX.XX"
- If 0 entries: warning "No approved entries found for this period"

**Submit:** `POST /v1/financial/invoices` with `GenerateInvoicePayload`

---

### `InvoiceDetailModal`

```typescript
interface InvoiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
}
```

**Data consumed:**
```
GET /v1/financial/invoices/:id
→ InspectorInvoice & { entries: FinancialEntry[] }
```

**Displays:**
- Invoice header (inspector, period, frequency, status chip)
- Financial entries table (appointment, type, amount, effectiveAt)
- Total row
- Action buttons: Download PDF, Send (if DRAFT), Mark Paid (if SENT/OVERDUE)

---

### `FinancialEntryFiltersBar`

```typescript
interface FinancialEntryFiltersBarProps {
  filters: FinancialEntryFilters;
  onChange: (f: FinancialEntryFilters) => void;
  onClear: () => void;
}
```

---

### `InvoiceFiltersBar`

```typescript
interface InvoiceFiltersBarProps {
  filters: InvoiceFilters;
  onChange: (f: InvoiceFilters) => void;
  onClear: () => void;
}
```

---

## 6. API Integration

### Endpoints

```typescript
// Financial entries
GET /v1/financial/entries                Query: FinancialEntryFilters → PaginatedFinancialEntries
GET /v1/financial/entries/summary        Query: (filters without pagination) → SummaryStats
POST /v1/financial/entries               Body: CreateAdjustmentPayload | CreateRefundPayload → FinancialEntry
POST /v1/financial/entries/approve       Body: ApproveEntryPayload → { approved: number }
PATCH /v1/financial/entries/:id/approve  Body: {} → FinancialEntry  (single approve)

// Invoices
GET /v1/financial/invoices               Query: InvoiceFilters → PaginatedInvoices
GET /v1/financial/invoices/:id           → InspectorInvoice & { entries: FinancialEntry[] }
GET /v1/financial/invoices/preview       Query: { inspectorId, periodStart, periodEnd } → InvoicePreview
GET /v1/financial/invoices/:id/pdf       → Blob (application/pdf)
POST /v1/financial/invoices              Body: GenerateInvoicePayload → InspectorInvoice
POST /v1/financial/invoices/:id/send     Body: {} → InspectorInvoice
POST /v1/financial/invoices/:id/mark-paid Body: {} → InspectorInvoice
POST /v1/financial/invoices/:id/cancel   Body: { reason: string } → InspectorInvoice

// Appointment-level financial entries (used on appointment detail Financial tab)
GET /v1/appointments/:id/financial-entries → FinancialEntry[]
```

### React Query Hooks

```typescript
// Financial entries list
function useFinancialEntries(filters: FinancialEntryFilters) {
  return useQuery({
    queryKey: ['financial', 'entries', 'list', filters],
    queryFn: () => financialApi.listEntries(filters),
    keepPreviousData: true,
    staleTime: 30_000,
  });
}

// Entries summary
function useFinancialSummary(filters: Omit<FinancialEntryFilters, 'page' | 'pageSize'>) {
  return useQuery({
    queryKey: ['financial', 'entries', 'summary', filters],
    queryFn: () => financialApi.getSummary(filters),
    staleTime: 30_000,
  });
}

// Invoices list
function useInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: ['financial', 'invoices', 'list', filters],
    queryFn: () => financialApi.listInvoices(filters),
    keepPreviousData: true,
    staleTime: 30_000,
  });
}

// Invoice detail
function useInvoice(id: string) {
  return useQuery({
    queryKey: ['financial', 'invoices', 'detail', id],
    queryFn: () => financialApi.getInvoice(id),
    enabled: !!id,
  });
}

// Invoice preview (generate modal)
function useInvoicePreview(
  inspectorId: string | null,
  periodStart: string | null,
  periodEnd: string | null
) {
  return useQuery({
    queryKey: ['financial', 'invoice-preview', { inspectorId, periodStart, periodEnd }],
    queryFn: () => financialApi.previewInvoice({ inspectorId: inspectorId!, periodStart: periodStart!, periodEnd: periodEnd! }),
    enabled: !!inspectorId && !!periodStart && !!periodEnd,
    staleTime: 60_000,
  });
}

// Create entry mutation (adjustment or refund)
function useCreateFinancialEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAdjustmentPayload | CreateRefundPayload) =>
      financialApi.createEntry(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'entries'] });
    },
  });
}

// Batch approve mutation
function useBatchApproveEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryIds: string[]) => financialApi.approveEntries({ entryIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'entries'] });
    },
  });
}

// Generate invoice mutation
function useGenerateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: GenerateInvoicePayload) => financialApi.generateInvoice(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial', 'invoices', 'list'] });
    },
  });
}

// Mark paid mutation
function useMarkInvoicePaid(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => financialApi.markPaid(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['financial', 'invoices', 'detail', id], data);
      queryClient.invalidateQueries({ queryKey: ['financial', 'invoices', 'list'] });
    },
  });
}

// Send invoice mutation
function useSendInvoice(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => financialApi.sendInvoice(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['financial', 'invoices', 'detail', id], data);
      queryClient.invalidateQueries({ queryKey: ['financial', 'invoices', 'list'] });
    },
  });
}
```

---

## 7. Business Rules in Frontend

### Access Control

- The entire `/financial/*` route tree is only accessible to AM and OP roles
- CL_ADMIN and CL_USER never see the Financial section in the sidebar navigation
- If a CL role lands on a `/financial/*` URL directly (e.g., via bookmark), they are redirected to `/403`

### Adjustment Rules

- Amount may be negative (deduction from inspector payout or agency debit)
- Notes are mandatory for all adjustments (min 10 chars)
- Adjustments on a cancelled or rejected appointment are not allowed (server-side; surface as 422 with error message)

### Refund Rules

- Refunds are only allowed on `TENANT_DEBIT` entries
- Refund amount cannot exceed the original debit amount
- Refunds require a second approval: the creating operator cannot be the same as the approving operator (server-side enforced)
- Frontend shows: "Refund created and awaiting second approval"

### Batch Approval

- Batch approve selects up to 50 entries at once
- Checkbox "select all" on current page only (not across pages)
- "Approve Selected (X)" shows count of selected PENDING entries

### Invoice Generation Rules

- Cannot generate an invoice for a period that already has an invoice for the same inspector (409 conflict)
- Surface 409 as: "An invoice already exists for this inspector and period."
- Period must be at least 1 day
- Period cannot extend into the future

### Amount Display

- All amounts stored as integers (cents) in the API
- Always display as formatted AUD: `$1,234.56`
- Negative amounts (deductions) displayed in red with a minus sign: `−$123.45`
- Zero amounts: `$0.00`

---

## 8. UX Rules

### Navigation Flows

- Financial menu item in sidebar: expands to show "Entries" and "Invoices" sub-items
- After generating invoice: modal closes, list refreshes, scroll to new invoice, show toast "Invoice generated for [Inspector Name]"
- After approving entries (single or batch): table rows update status in place, toast "X entries approved"
- After refund creation: modal closes, toast "Refund created and pending approval"
- After mark paid: row status updates to PAID, toast "Invoice marked as paid"

### Destructive Confirmations

- Mark Paid: simple confirm modal "Mark this invoice as paid? This cannot be undone."
- Send Invoice: confirm modal "Send invoice to [Inspector Email]? They will receive an email with payment details."
- Cancel Invoice: requires reason + red confirm button

### Success/Error Feedback

- Success: green toast, 4 seconds
- Error: red persistent toast
- 409 conflict (duplicate invoice): inline error in modal form
- 422 validation: inline field errors mapped from server `details`

### Responsive Behavior

- Tables: horizontal scroll on mobile for all financial tables (density too high for wrapping)
- Summary bar: scrollable horizontally on mobile
- Modals: full-screen on mobile (< 640px)

### Currency Consistency

- All amounts in AUD throughout the UI
- Currency symbol displayed as "$" (not "AUD" abbreviation)
- Use `Intl.NumberFormat` for all currency formatting to ensure correct locale handling

### PDF Download

- Clicking "Download PDF" triggers immediate browser download
- File name format: `invoice-{inspectorLastName}-{periodStart}-{periodEnd}.pdf`
- If PDF generation fails (server error): toast "PDF generation failed. Please try again."

### Empty States

- No entries: "No financial entries found. Entries are created automatically when appointments are completed."
- No invoices: "No invoices yet. Use the 'Generate Invoice' button to create the first invoice for an inspector."
- Invoice preview shows 0 entries: yellow warning "No approved entries found for this inspector in the selected period. Make sure entries are approved before generating an invoice."
