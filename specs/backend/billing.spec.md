# Billing Module – Implementation Spec

**Version:** 1.0
**Module path:** `apps/backend/src/modules/billing`
**Last updated:** 2026-03-15

---

## 1. Overview

### Purpose

The Billing module manages all financial activity on the Properfy platform. Its responsibilities are:

1. **Automatic entry creation:** When an appointment reaches `DONE`, two financial entries are created — a `TENANT_DEBIT` (charge to the agency) and an `INSPECTOR_PAYOUT` (payment due to the inspector).
2. **Manual adjustments and refunds:** AM/OP can create `MANUAL_ADJUSTMENT` and `REFUND` entries with dual-approval requirements.
3. **Approval workflow:** Refunds and manual adjustments require a second approver (different from the initiator).
4. **Invoice generation:** Closing inspector billing periods (weekly/biweekly/monthly) into `InspectorInvoice` records with generated XLSX files stored in S3.
5. **Financial entry immutability:** Entries are never updated. Corrections are made by creating opposing entries.

This module is triggered primarily by domain events from the Appointments module (`appointment.done`) and responds to operator actions via the financial API.

### Actors

| Actor | Interaction |
|---|---|
| AM | All billing operations; second approver for any entry |
| OP | All billing operations except reopening DONE; second approver for any entry |
| CL_ADMIN | Read-only: own tenant's financial entries |
| CL_USER | Read-only: if agency explicitly grants permission |
| INSP | Read-only: own invoices and payout entries |

### Domain Boundaries

- Owns: `FinancialEntry`, `InspectorInvoice` entities
- Reads: `Appointment`, `Inspector`, `Tenant`, `ServicePriceRule`
- Consumes: `appointment.done` domain event (auto-creates entries)
- Produces: `financial_entry.created`, `financial_entry.approved`, `invoice.generated` events
- Does NOT own: appointment state machine, notification sending (delegates to notifications module)

---

## 2. Data Model

### 2.1 Enums

#### `FinancialEntryType`

```prisma
enum FinancialEntryType {
  TENANT_DEBIT       // Charge to the agency for a completed inspection
  INSPECTOR_PAYOUT   // Payment due to inspector for a completed inspection
  REFUND             // Refund to agency when service was marked done but not executed
  MANUAL_ADJUSTMENT  // Manual correction initiated by AM or OP
}
```

#### `FinancialEntryStatus`

```prisma
enum FinancialEntryStatus {
  PENDING   // Created; awaiting approval (for REFUND and MANUAL_ADJUSTMENT) or pending OP cross-check
  APPROVED  // Approved and confirmed; included in invoicing period
  CANCELLED // Cancelled (opposing entry created); never deleted
}
```

#### `InspectorInvoiceStatus`

```prisma
enum InspectorInvoiceStatus {
  OPEN       // Period still active; entries can be added
  CLOSED     // Period closed; no new entries; file being generated
  PAID       // Invoice settled/paid
}
```

#### `BillingPeriodType`

```prisma
enum BillingPeriodType {
  WEEKLY
  BIWEEKLY
  MONTHLY
}
```

### 2.2 Entity: `FinancialEntry`

**Table:** `financial_entries`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| tenant_id | String | No | — | FK → tenants.id |
| appointment_id | String | Yes | — | FK → appointments.id; null for global adjustments |
| inspector_id | String | Yes | — | FK → inspectors.id; null for TENANT_DEBIT |
| entry_type | FinancialEntryType | No | — | enum |
| amount | Decimal | No | — | precision(12,2); always positive |
| currency | String | No | — | ISO 4217, e.g. "AUD" |
| status | FinancialEntryStatus | No | `PENDING` | enum |
| description | String | No | — | max 500 chars |
| effective_at | DateTime | No | — | date when entry takes financial effect |
| initiated_by_user_id | String | No | — | FK → users.id; who created this entry |
| approved_by_user_id | String | Yes | — | FK → users.id; second approver (different from initiator) |
| approved_at | DateTime | Yes | — | when approval happened |
| reference_entry_id | String | Yes | — | FK → financial_entries.id; for REFUND/ADJUSTMENT linked to original |
| reason | String | Yes | — | required for REFUND and MANUAL_ADJUSTMENT |
| created_at | DateTime | No | `now()` | immutable |
| updated_at | DateTime | No | `now()` | auto-updated |

```prisma
model FinancialEntry {
  id                    String               @id @default(uuid())
  tenant_id             String
  appointment_id        String?
  inspector_id          String?
  entry_type            FinancialEntryType
  amount                Decimal              @db.Decimal(12, 2)
  currency              String               @db.Char(3)
  status                FinancialEntryStatus @default(PENDING)
  description           String               @db.VarChar(500)
  effective_at          DateTime
  initiated_by_user_id  String
  approved_by_user_id   String?
  approved_at           DateTime?
  reference_entry_id    String?
  reason                String?
  created_at            DateTime             @default(now())
  updated_at            DateTime             @updatedAt

  tenant                Tenant               @relation(fields: [tenant_id], references: [id])
  appointment           Appointment?         @relation(fields: [appointment_id], references: [id])
  inspector             Inspector?           @relation(fields: [inspector_id], references: [id])
  initiatedBy           User                 @relation("EntryInitiator", fields: [initiated_by_user_id], references: [id])
  approvedBy            User?                @relation("EntryApprover", fields: [approved_by_user_id], references: [id])
  referenceEntry        FinancialEntry?      @relation("EntryReference", fields: [reference_entry_id], references: [id])
  relatedEntries        FinancialEntry[]     @relation("EntryReference")

  @@index([tenant_id])
  @@index([appointment_id])
  @@index([inspector_id])
  @@index([entry_type])
  @@index([status])
  @@index([effective_at])
  @@index([tenant_id, entry_type, status])
  @@map("financial_entries")
}
```

### 2.3 Entity: `InspectorInvoice`

**Table:** `inspector_invoices`

| Field | Prisma Type | Nullable | Default | Constraint |
|---|---|---|---|---|
| id | String | No | `uuid()` | PK |
| inspector_id | String | No | — | FK → inspectors.id |
| period_start | DateTime | No | — | start of billing period (inclusive), date only |
| period_end | DateTime | No | — | end of billing period (inclusive), date only |
| period_type | BillingPeriodType | No | — | enum |
| status | InspectorInvoiceStatus | No | `OPEN` | enum |
| total_amount | Decimal | No | 0 | precision(12,2) |
| currency | String | No | — | ISO 4217 |
| file_key | String | Yes | — | S3 key of generated XLSX |
| generated_by_user_id | String | Yes | — | FK → users.id |
| generated_at | DateTime | Yes | — | when XLSX was generated |
| paid_at | DateTime | Yes | — | when marked as paid |
| notes | String | Yes | — | operator notes |
| created_at | DateTime | No | `now()` | |
| updated_at | DateTime | No | `now()` | auto-updated |

```prisma
model InspectorInvoice {
  id                    String                  @id @default(uuid())
  inspector_id          String
  period_start          DateTime                @db.Date
  period_end            DateTime                @db.Date
  period_type           BillingPeriodType
  status                InspectorInvoiceStatus  @default(OPEN)
  total_amount          Decimal                 @db.Decimal(12, 2) @default(0)
  currency              String                  @db.Char(3)
  file_key              String?
  generated_by_user_id  String?
  generated_at          DateTime?
  paid_at               DateTime?
  notes                 String?
  created_at            DateTime                @default(now())
  updated_at            DateTime                @updatedAt

  inspector             Inspector               @relation(fields: [inspector_id], references: [id])
  generatedBy           User?                   @relation(fields: [generated_by_user_id], references: [id])

  @@unique([inspector_id, period_start, period_end])
  @@index([inspector_id, status])
  @@index([period_start, period_end])
  @@map("inspector_invoices")
}
```

### 2.4 Referenced entities

- `appointments.price_amount` — amount to debit to tenant
- `appointments.payout_amount` — amount to pay to inspector
- `appointments.pricing_rule_snapshot_json` — frozen pricing rule at time of creation
- `appointments.done_checked_by_user_id` — OP who cross-checked the DONE status
- `service_price_rules` — base pricing; split type and value
- `inspectors.payment_settings_json` — billing period config per inspector
- `tenants.settings_json` — billing period config per client

---

## 3. Use Cases

### 3.1 `createFinancialEntriesOnDone`

**Actor:** SYS (triggered internally on `appointment.done` event)
**Input:** `appointmentId`
**Idempotency:** Uses `appointment_id` uniqueness — only one TENANT_DEBIT and one INSPECTOR_PAYOUT per appointment can exist.

**Steps:**

1. Load appointment with pricing snapshot: `price_amount`, `payout_amount`, `pricing_rule_snapshot_json`, `inspector_id`, `tenant_id`, `done_checked_by_user_id`.
2. Verify `status = DONE`. If not → abort silently (idempotency guard).
3. Check if TENANT_DEBIT entry already exists for this appointment → skip if so (idempotent).
4. Check if INSPECTOR_PAYOUT entry already exists → skip if so.
5. Determine `currency` from `tenant.currency`.
6. Within a DB transaction:
   a. Create `FinancialEntry` type `TENANT_DEBIT`:
      - `amount = appointment.price_amount`
      - `effective_at = now()`
      - `status = APPROVED` (auto-approved on DONE; OP cross-check is a separate step)
      - `description = "Inspection service: {serviceType.name} at {property.address}"`
      - `initiated_by_user_id = system_user_id` (system actor)
   b. Create `FinancialEntry` type `INSPECTOR_PAYOUT`:
      - `amount = appointment.payout_amount`
      - `effective_at = now()`
      - `status = PENDING` (requires OP cross-check to move to APPROVED — see Business Rule 2)
      - `description = "Inspector payout: {inspector.name} – {serviceType.name}"`
      - `initiated_by_user_id = system_user_id`
7. Emit `financial_entry.created` for each entry.

### 3.2 `listFinancialEntries`

**Actor:** AM, OP (all tenants), CL_ADMIN (own tenant only), CL_USER (own tenant if permission granted)
**Input:** JWT, query filters

**Steps:**

1. Extract actor role and `tenantId` from JWT.
2. Apply tenant scope:
   - AM/OP: can filter by any `tenantId`; if no `tenantId` filter, returns all.
   - CL_ADMIN/CL_USER: forced `tenant_id = jwtTenantId` regardless of query param.
3. Apply filters: `type`, `status`, `inspectorId`, `tenantId`, `fromDate` (effective_at >=), `toDate` (effective_at <=).
4. Paginate: `page`, `pageSize` (default 20, max 100).
5. Return entries with initiator and approver user names (joined).

### 3.3 `approveFinancialEntry`

**Actor:** AM, OP
**Input:** JWT, `entryId`

**Steps:**

1. Load `FinancialEntry` where `id = entryId` AND `status = PENDING`.
2. If not found or not PENDING → `ENTRY_NOT_PENDING`.
3. Validate that `approvedBy != initiatedBy` (self-approval is prohibited) → `ENTRY_SELF_APPROVAL_NOT_ALLOWED`.
4. Validate entry type requires approval: `REFUND` and `MANUAL_ADJUSTMENT` require approval; `TENANT_DEBIT` and `INSPECTOR_PAYOUT` follow automatic approval (see Business Rule 2).
5. Update `status = APPROVED`, `approved_by_user_id = actorId`, `approved_at = now()`.
6. Create audit log.
7. Emit `financial_entry.approved`.

### 3.4 `createManualAdjustment`

**Actor:** AM, OP
**Input:** JWT, `entryId` (optional — can be standalone), `{ amount, description, reason }`

**Steps:**

1. Validate `reason` is non-empty (required).
2. Validate `amount > 0`.
3. Load `tenantId` from JWT or from referenced entry.
4. Create `FinancialEntry` type `MANUAL_ADJUSTMENT`:
   - `status = PENDING` (requires second approver)
   - `reference_entry_id = entryId` (if adjusting a specific entry)
   - `reason = reason`
5. Emit `financial_entry.created`.
6. Return entry awaiting approval.

### 3.5 `createRefund`

**Actor:** AM, OP
**Input:** JWT, `originalEntryId`, `{ description, reason }`

**Steps:**

1. Validate `reason` is non-empty (required).
2. Load original `FinancialEntry` where `entry_type = TENANT_DEBIT` AND `status = APPROVED`.
3. If not found → `ENTRY_NOT_FOUND`.
4. Check no existing REFUND already references this `original_entry_id` → `REFUND_ALREADY_EXISTS`.
5. Create `FinancialEntry` type `REFUND`:
   - `amount = originalEntry.amount` (full refund; partial refunds use MANUAL_ADJUSTMENT)
   - `status = PENDING`
   - `reference_entry_id = originalEntryId`
   - `reason = reason`
   - `tenant_id = originalEntry.tenant_id`
   - `appointment_id = originalEntry.appointment_id`
6. Emit `financial_entry.created`.
7. Return entry awaiting approval.

### 3.6 `generateInvoice`

**Actor:** AM, OP
**Input:** JWT, `{ inspectorId, periodStart, periodEnd }`

**Steps:**

1. Validate `periodStart <= periodEnd`.
2. Validate no overlapping OPEN/CLOSED invoice for this inspector + period.
3. Check if invoice already exists for exact `inspector_id + period_start + period_end` (unique constraint) → return existing if found.
4. Collect all `FinancialEntry` records of type `INSPECTOR_PAYOUT`, `status = APPROVED`, `inspector_id = inspectorId`, `effective_at BETWEEN periodStart AND periodEnd`.
5. Compute `total_amount = SUM(amount)`.
6. Create `InspectorInvoice`:
   - `status = CLOSED`
   - `total_amount`
   - `generated_by_user_id = actorId`
7. Enqueue pg-boss job `billing.generate-invoice-file` with `invoiceId`.
8. Return `{ invoiceId, status: "CLOSED", totalAmount }`.

### 3.7 `listInvoices`

**Actor:** AM, OP (all inspectors), INSP (own only)
**Input:** JWT, filters: `inspectorId`, `status`, `fromDate`, `toDate`

**Steps:**

1. Extract role from JWT.
2. If INSP: force `inspector_id = jwt.inspectorId`.
3. Apply filters and paginate.
4. Return invoices with inspector name joined.

### 3.8 `downloadInvoice`

**Actor:** AM, OP, INSP (own)
**Input:** JWT, `invoiceId`

**Steps:**

1. Load invoice; check access scope.
2. If `status != CLOSED && status != PAID` → `INVOICE_NOT_READY`.
3. If `file_key IS NULL` → `INVOICE_FILE_NOT_GENERATED`.
4. Generate presigned GET URL (TTL: 60 minutes) for `file_key` in Supabase Storage.
5. Return `{ downloadUrl, expiresAt }`.

---

## 4. API Contracts

All endpoints require `Authorization: Bearer {JWT}`.

### 4.1 `GET /v1/financial/entries`

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| type | string | No | FinancialEntryType enum value |
| status | string | No | FinancialEntryStatus enum value |
| inspectorId | string | No | Filter by inspector (AM/OP only) |
| tenantId | string | No | Filter by tenant (AM/OP; CL auto-scoped) |
| fromDate | string | No | YYYY-MM-DD; filters effective_at >= |
| toDate | string | No | YYYY-MM-DD; filters effective_at <= |
| page | number | No | default 1 |
| pageSize | number | No | default 20, max 100 |
| sortBy | string | No | `effectiveAt` (default), `amount`, `createdAt` |
| sortOrder | string | No | `asc` / `desc` (default `desc`) |

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "appointmentId": "uuid",
      "inspectorId": "uuid",
      "entryType": "INSPECTOR_PAYOUT",
      "amount": "150.00",
      "currency": "AUD",
      "status": "APPROVED",
      "description": "Inspector payout: John Smith – Routine Inspection",
      "effectiveAt": "2026-03-21T10:45:00.000Z",
      "reason": null,
      "referenceEntryId": null,
      "initiatedBy": { "id": "uuid", "name": "System" },
      "approvedBy": null,
      "approvedAt": null,
      "createdAt": "2026-03-21T10:45:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 143,
    "totalPages": 8
  }
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Role not permitted |

### 4.2 `GET /v1/financial/entries/:entryId`

**Response 200:** Same structure as single entry in list above, with full detail.

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `ENTRY_NOT_FOUND` | Entry not found or out of scope |

### 4.3 `POST /v1/financial/entries/:entryId/approve`

**Purpose:** Second-approver step for REFUND or MANUAL_ADJUSTMENT.

**Request body:** none

**Response 200:**

```json
{
  "id": "uuid",
  "status": "APPROVED",
  "approvedBy": { "id": "uuid", "name": "Alice OP" },
  "approvedAt": "2026-03-21T11:00:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `ENTRY_NOT_FOUND` | Not found |
| 409 | `ENTRY_NOT_PENDING` | Entry is not in PENDING status |
| 422 | `ENTRY_SELF_APPROVAL_NOT_ALLOWED` | Actor is same as initiator |

### 4.4 `POST /v1/financial/entries/adjust`

**Purpose:** Create a MANUAL_ADJUSTMENT entry.

**Request body (Zod schema):**

```typescript
const ManualAdjustmentSchema = z.object({
  tenantId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  amount: z.number().positive(),
  description: z.string().min(1).max(500),
  reason: z.string().min(1).max(1000),
  effectiveAt: z.string().datetime().optional(), // defaults to now()
  referenceEntryId: z.string().uuid().optional(),
});
```

**Response 201:**

```json
{
  "id": "uuid",
  "entryType": "MANUAL_ADJUSTMENT",
  "amount": "50.00",
  "currency": "AUD",
  "status": "PENDING",
  "description": "Price correction for extra time",
  "reason": "Inspector stayed additional 45 min per OP request",
  "effectiveAt": "2026-03-21T00:00:00.000Z",
  "createdAt": "2026-03-21T11:00:00.000Z"
}
```

### 4.5 `POST /v1/financial/entries/:entryId/refund`

**Purpose:** Create a REFUND entry referencing an original TENANT_DEBIT.

**Request body (Zod schema):**

```typescript
const CreateRefundSchema = z.object({
  description: z.string().min(1).max(500),
  reason: z.string().min(1).max(1000),
});
```

**Response 201:**

```json
{
  "id": "uuid",
  "entryType": "REFUND",
  "amount": "200.00",
  "currency": "AUD",
  "status": "PENDING",
  "referenceEntryId": "original-entry-uuid",
  "reason": "Inspection was not executed; tenant had moved out",
  "createdAt": "2026-03-21T11:00:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `ENTRY_NOT_FOUND` | Original entry not found |
| 409 | `REFUND_ALREADY_EXISTS` | Refund already created for this entry |
| 422 | `ENTRY_NOT_REFUNDABLE` | Original entry is not APPROVED TENANT_DEBIT |

### 4.6 `GET /v1/invoices`

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| inspectorId | string | No | AM/OP only; INSP auto-scoped |
| status | string | No | InspectorInvoiceStatus |
| fromDate | string | No | YYYY-MM-DD; period_start >= |
| toDate | string | No | YYYY-MM-DD; period_end <= |
| page | number | No | default 1 |
| pageSize | number | No | default 20, max 50 |

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "inspectorId": "uuid",
      "inspectorName": "John Inspector",
      "periodStart": "2026-03-01",
      "periodEnd": "2026-03-15",
      "periodType": "BIWEEKLY",
      "status": "CLOSED",
      "totalAmount": "1250.00",
      "currency": "AUD",
      "generatedAt": "2026-03-16T08:00:00.000Z",
      "paidAt": null,
      "createdAt": "2026-03-16T07:59:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 }
}
```

### 4.7 `POST /v1/invoices/generate`

**Purpose:** Close a billing period and generate an invoice for an inspector.

**Request body (Zod schema):**

```typescript
const GenerateInvoiceSchema = z.object({
  inspectorId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(
  (d) => new Date(d.periodEnd) >= new Date(d.periodStart),
  { message: "periodEnd must be >= periodStart" }
);
```

**Response 202:**

```json
{
  "invoiceId": "uuid",
  "status": "CLOSED",
  "totalAmount": "1250.00",
  "currency": "AUD",
  "message": "Invoice generation queued. File will be available shortly."
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `INSPECTOR_NOT_FOUND` | Inspector not found |
| 409 | `INVOICE_PERIOD_OVERLAP` | Overlapping invoice already exists for this inspector |
| 422 | `VALIDATION_ERROR` | Invalid period dates |

### 4.8 `GET /v1/invoices/:invoiceId`

**Response 200:** Full invoice detail including `totalAmount`, `status`, `fileKey` (if ready).

### 4.9 `GET /v1/invoices/:invoiceId/download`

**Response 200:**

```json
{
  "downloadUrl": "https://supabase-storage.../signed-url...",
  "expiresAt": "2026-03-21T12:00:00.000Z"
}
```

**Error responses:**

| HTTP | Code | Condition |
|---|---|---|
| 404 | `INVOICE_NOT_FOUND` | Invoice not found |
| 409 | `INVOICE_NOT_READY` | Status is not CLOSED or PAID |
| 409 | `INVOICE_FILE_NOT_GENERATED` | File not yet in S3 |

---

## 5. Business Rules

1. **Entries created automatically on DONE:** When `appointment.status` transitions to `DONE`, the system creates exactly one `TENANT_DEBIT` and one `INSPECTOR_PAYOUT` entry per appointment. This is idempotent: if entries already exist for the appointment, no duplicates are created.

2. **Auto-approval for DONE entries:** `TENANT_DEBIT` entries created by the system on DONE are set to `APPROVED` immediately. `INSPECTOR_PAYOUT` entries are created as `PENDING` and become `APPROVED` once an OP performs the cross-check (sets `done_checked_by_user_id` on the appointment, then calls `approveFinancialEntry` on the payout entry). This separation ensures inspector payments are verified before disbursement.

3. **Financial entries are immutable:** Once created, a `FinancialEntry` record is never updated (except for `status`, `approved_by_user_id`, `approved_at` fields which are part of the approval lifecycle). Dollar amounts, descriptions, and references are frozen at creation. Corrections are made by creating new opposing entries (`MANUAL_ADJUSTMENT` or `REFUND`).

4. **Cancellation has no cost:** Cancelling an appointment in any status (DRAFT, AWAITING_INSPECTOR, SCHEDULED) creates no financial entries. If an appointment is cancelled AFTER reaching DONE (e.g., via AM reopening), any existing financial entries must be manually handled via REFUND/ADJUSTMENT.

5. **Refund requires APPROVED TENANT_DEBIT source:** A REFUND entry must reference an existing `TENANT_DEBIT` entry in `APPROVED` status. Only one REFUND may reference a given TENANT_DEBIT (full refund model; partial corrections use MANUAL_ADJUSTMENT).

6. **Refund use case:** Refunds are only appropriate when a service was marked DONE but was not actually executed. They should be accompanied by a `DONE → REJECTED` or `DONE → DRAFT` state transition on the appointment.

7. **Dual approval for REFUND and MANUAL_ADJUSTMENT:** Both entry types are created with `status = PENDING`. They require a second operator (`approved_by_user_id`) who is DIFFERENT from `initiated_by_user_id` to call the approve endpoint. Self-approval is prohibited and returns `ENTRY_SELF_APPROVAL_NOT_ALLOWED`.

8. **Billing period is configurable per entity:**
   - Tenants have a billing period type in `tenants.settings_json.billingPeriodType`.
   - Inspectors have a billing period type in `inspectors.payment_settings_json.billingPeriodType`.
   - Valid values: `WEEKLY`, `BIWEEKLY`, `MONTHLY`.
   - Default: `BIWEEKLY` if not set.

9. **Invoice covers only APPROVED INSPECTOR_PAYOUT entries:** The `total_amount` on an `InspectorInvoice` is the sum of all `INSPECTOR_PAYOUT` entries with `status = APPROVED` for the inspector within the period. PENDING entries are not included until approved.

10. **Invoice uniqueness:** Only one invoice per `(inspector_id, period_start, period_end)` triplet. Attempting to generate a duplicate returns the existing invoice.

11. **Invoice file is generated asynchronously:** Calling `POST /v1/invoices/generate` enqueues a pg-boss job. The response is `202 Accepted`. The caller polls `GET /v1/invoices/:invoiceId` or waits for a notification when the file is ready.

12. **Invoice XLSX format:** The generated file includes: invoice header (inspector name, period, total), line items per payout entry (date, appointment ID, property address, service type, amount), summary row. File is stored in Supabase Storage under `invoices/{inspectorId}/{invoiceId}.xlsx`.

13. **Currency consistency:** All entries for a tenant use the tenant's configured currency. All entries for an inspector use the inspector's configured payout currency. Cross-currency invoicing is not supported in v1 (same currency required).

14. **Amount validation:** All `amount` values must be positive decimals with up to 2 decimal places. Zero-amount entries are not allowed.

15. **Scope enforcement:** CL_ADMIN and CL_USER can only see entries where `tenant_id` matches their own tenant. They cannot see entries for other tenants, inspector payouts to third-party inspectors (those are always AM/OP only), or adjustment details.

16. **INSP scope:** Inspector role can only see their own `INSPECTOR_PAYOUT` entries and their own `InspectorInvoice` records. They cannot see TENANT_DEBIT, REFUND, or MANUAL_ADJUSTMENT entries.

17. **Reason required for REFUND and MANUAL_ADJUSTMENT:** Creating either entry type without a `reason` string returns `422 VALIDATION_ERROR`.

---

## 6. Authorization Matrix

| Endpoint | AM | OP | CL_ADMIN | CL_USER | INSP |
|---|---|---|---|---|---|
| GET /v1/financial/entries | All tenants | All tenants | Own tenant | Own tenant (if perm) | Own payouts only |
| GET /v1/financial/entries/:id | All | All | Own tenant | Own tenant (if perm) | Own only |
| POST .../approve | Allowed | Allowed | Denied | Denied | Denied |
| POST /v1/financial/entries/adjust | Allowed | Allowed | Denied | Denied | Denied |
| POST .../refund | Allowed | Allowed | Denied | Denied | Denied |
| GET /v1/invoices | All | All | Denied | Denied | Own only |
| POST /v1/invoices/generate | Allowed | Allowed | Denied | Denied | Denied |
| GET /v1/invoices/:id | Allowed | Allowed | Denied | Denied | Own only |
| GET /v1/invoices/:id/download | Allowed | Allowed | Denied | Denied | Own only |

---

## 7. Domain Events

### `financial_entry.created`

```typescript
{
  event: "financial_entry.created",
  payload: {
    entryId: string,
    entryType: FinancialEntryType,
    appointmentId: string | null,
    inspectorId: string | null,
    tenantId: string,
    amount: string,
    currency: string,
    status: FinancialEntryStatus,
    initiatedByUserId: string,
    createdAt: string,
  }
}
```

**Consumers:** Audit log; Notifications module (notify OP of pending approval for REFUND/ADJUSTMENT).

### `financial_entry.approved`

```typescript
{
  event: "financial_entry.approved",
  payload: {
    entryId: string,
    entryType: FinancialEntryType,
    approvedByUserId: string,
    approvedAt: string,
    amount: string,
    tenantId: string,
  }
}
```

**Consumers:** Audit log; Notifications module (confirm approval to initiator).

### `invoice.generated`

```typescript
{
  event: "invoice.generated",
  payload: {
    invoiceId: string,
    inspectorId: string,
    periodStart: string,
    periodEnd: string,
    totalAmount: string,
    currency: string,
    fileKey: string,
    generatedAt: string,
  }
}
```

**Consumers:** Notifications module (notify inspector that invoice is ready); Audit log.

---

## 8. Queue Jobs

### `billing.create-entries-on-done` (event-driven)

**Trigger:** `appointment.done` domain event (pg-boss queue).

**Payload:**

```typescript
{
  jobName: "billing.create-entries-on-done",
  payload: {
    appointmentId: string,
    tenantId: string,
    inspectorId: string,
  }
}
```

**Behavior:** Calls `createFinancialEntriesOnDone` use case. Idempotent. Retries up to 3 times on failure with exponential backoff.

**Dead letter queue:** Failed jobs have state `failed` in the `pgboss.job` table. Use `boss.resume(jobId)` to reprocess failed jobs.

### `billing.generate-invoice-file` (async)

**Trigger:** `POST /v1/invoices/generate` → enqueues this job.

**Payload:**

```typescript
{
  jobName: "billing.generate-invoice-file",
  payload: {
    invoiceId: string,
    requestedByUserId: string,
  }
}
```

**Behavior:**

1. Load `InspectorInvoice` by `invoiceId`.
2. Load all `INSPECTOR_PAYOUT` entries with `status = APPROVED` in period.
3. Generate XLSX using `exceljs` or similar library.
4. Upload to Supabase Storage at key `invoices/{inspectorId}/{invoiceId}.xlsx`.
5. Update `InspectorInvoice.file_key`, `generated_at`.
6. Update status to remain `CLOSED` (file now available).
7. Emit `invoice.generated` event.

On failure: update invoice with error marker; emit `invoice.generation_failed` event. Retries: 2 attempts.

---

## 9. External Integrations

### Supabase Storage (S3-compatible)

**Usage:** Store generated invoice XLSX files.

**Bucket:** `billing-documents` (configurable via `STORAGE_BUCKET_BILLING` env var).

**Key pattern:** `invoices/{inspectorId}/{invoiceId}.xlsx`

**Presigned GET URL TTL:** 60 minutes (for download endpoint).

---

## 10. Test Scenarios

### Unit Tests (Vitest)

#### `createFinancialEntriesOnDone`

- Creates TENANT_DEBIT with `status = APPROVED` and INSPECTOR_PAYOUT with `status = PENDING`.
- Uses `price_amount` for debit and `payout_amount` for payout from appointment.
- Idempotent: calling twice for same appointment produces no duplicates.
- Does not create entries if appointment is not DONE.

#### `approveFinancialEntry`

- Sets `status = APPROVED`, `approved_by_user_id`, `approved_at`.
- Rejects self-approval (`initiated_by == approved_by`).
- Rejects entries not in PENDING status.

#### `createManualAdjustment`

- Creates entry with `status = PENDING`, correct `entry_type = MANUAL_ADJUSTMENT`.
- Rejects if `reason` is empty.
- Rejects if `amount <= 0`.

#### `createRefund`

- Creates REFUND referencing original TENANT_DEBIT.
- Rejects if original entry is not APPROVED TENANT_DEBIT.
- Rejects if refund already exists for that entry.

#### `generateInvoice`

- Creates `InspectorInvoice` with `status = CLOSED` and correct `total_amount`.
- Enqueues `billing.generate-invoice-file` job.
- Returns existing invoice if called again with same inspector + period.
- Rejects overlapping period.

#### `listFinancialEntries` — scope enforcement

- CL_ADMIN sees only their own tenant's entries.
- INSP sees only their own INSPECTOR_PAYOUT entries.
- AM sees all entries across tenants.

### Integration Tests (Supertest)

#### Auto-entry creation on DONE

1. Create appointment in SCHEDULED status with known `price_amount` and `payout_amount`.
2. Trigger `appointment.done` event (or call status transition endpoint).
3. `GET /v1/financial/entries?appointmentId={id}` → returns 2 entries: TENANT_DEBIT (APPROVED) + INSPECTOR_PAYOUT (PENDING).

#### Approval flow

1. `POST /financial/entries/{payoutId}/approve` with OP who is NOT the initiator → 200, status APPROVED.
2. `POST /financial/entries/{payoutId}/approve` with same OP as initiator → 422 ENTRY_SELF_APPROVAL_NOT_ALLOWED.
3. `POST /financial/entries/{payoutId}/approve` again (already APPROVED) → 409 ENTRY_NOT_PENDING.

#### Refund flow

1. Create DONE appointment → TENANT_DEBIT created.
2. `POST /financial/entries/{debitId}/refund` → 201 PENDING.
3. `POST /financial/entries/{refundId}/approve` → 200 APPROVED.
4. `POST /financial/entries/{debitId}/refund` again → 409 REFUND_ALREADY_EXISTS.

#### Invoice generation

1. `POST /v1/invoices/generate` → 202, invoiceId returned.
2. Job processes: XLSX generated, file_key set.
3. `GET /v1/invoices/{id}` → status CLOSED, generatedAt set.
4. `GET /v1/invoices/{id}/download` → 200, downloadUrl returned.
5. Second generate request with same period → 202 with existing invoiceId (idempotent).

#### Role enforcement

- INSP calling `POST /v1/invoices/generate` → 403.
- CL_ADMIN calling `POST /financial/entries/adjust` → 403.
- INSP calling `GET /financial/entries` returns only own INSPECTOR_PAYOUT entries.

### Edge Cases

- Appointment with `price_amount = 0` creates TENANT_DEBIT with `amount = 0` → blocked by validation (Rule 14); system should log and alert operator if appointment reaches DONE with zero price.
- Two concurrent `appointment.done` events for same appointment → only one set of entries created (idempotency via unique constraint on `appointment_id + entry_type` query check).
- Invoice with no approved payout entries (empty period) → `total_amount = 0`; invoice created but XLSX is minimal.
- Refunding an already-refunded entry → `REFUND_ALREADY_EXISTS`.
