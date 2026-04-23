# Appointment Module – Backend Implementation Spec

> **SUPERSEDED** by `specs/004-appointments/` — this legacy spec is preserved for historical reference only.

**Version:** 1.0
**Date:** 2026-03-15
**Module path:** `apps/backend/src/modules/appointment/`
**Scope:** This document is the single source of truth for implementing and testing the appointment module. No other document needs to be consulted.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Use Cases](#3-use-cases)
4. [API Contracts](#4-api-contracts)
5. [Business Rules](#5-business-rules)
6. [Authorization Matrix](#6-authorization-matrix)
7. [Domain Events](#7-domain-events)
8. [Queue Jobs](#8-queue-jobs)
9. [Test Scenarios](#9-test-scenarios)

---

## 1. Overview

The appointment module is the core business entity of Properfy. It orchestrates the complete lifecycle of a property inspection from creation through execution and financial settlement.

### 1.1 Responsibilities

- Create and manage appointment entities with full audit trail
- Enforce the appointment state machine (14 transitions, 6 statuses)
- Handle bulk import via XLSX/CSV with async processing
- Trigger financial settlement when inspection is completed
- Integrate with notification, financial, audit and service-group modules via domain events and pg-boss jobs
- Enforce multi-tenant isolation on every operation
- Enforce RBAC on every transition and operation

### 1.2 Module structure

```
src/modules/appointment/
├── domain/
│   ├── entities/
│   │   ├── appointment.entity.ts
│   │   ├── appointment-contact.entity.ts
│   │   └── appointment-restriction.entity.ts
│   ├── value-objects/
│   │   ├── appointment-status.vo.ts
│   │   ├── tenant-confirmation-status.vo.ts
│   │   └── time-slot.vo.ts
│   ├── enums/
│   │   ├── appointment-status.enum.ts
│   │   ├── tenant-confirmation-status.enum.ts
│   │   └── restriction-source.enum.ts
│   ├── errors/
│   │   └── appointment.errors.ts
│   └── ports/
│       ├── appointment.repository.port.ts
│       └── appointment-import.repository.port.ts
├── application/
│   ├── use-cases/
│   │   ├── create-appointment/
│   │   │   ├── create-appointment.use-case.ts
│   │   │   ├── create-appointment.dto.ts
│   │   │   └── create-appointment.validator.ts
│   │   ├── list-appointments/
│   │   │   ├── list-appointments.use-case.ts
│   │   │   ├── list-appointments.dto.ts
│   │   │   └── list-appointments.validator.ts
│   │   ├── get-appointment/
│   │   │   ├── get-appointment.use-case.ts
│   │   │   └── get-appointment.dto.ts
│   │   ├── update-appointment/
│   │   │   ├── update-appointment.use-case.ts
│   │   │   ├── update-appointment.dto.ts
│   │   │   └── update-appointment.validator.ts
│   │   ├── execute-status-transition/
│   │   │   ├── execute-status-transition.use-case.ts
│   │   │   ├── execute-status-transition.dto.ts
│   │   │   └── execute-status-transition.validator.ts
│   │   ├── import-appointments/
│   │   │   ├── import-appointments.use-case.ts
│   │   │   ├── import-appointments.dto.ts
│   │   │   └── import-appointments.validator.ts
│   │   └── force-manual-tenant-confirmation/
│   │       ├── force-manual-tenant-confirmation.use-case.ts
│   │       ├── force-manual-tenant-confirmation.dto.ts
│   │       └── force-manual-tenant-confirmation.validator.ts
│   └── services/
│       ├── appointment-state-machine.service.ts
│       ├── appointment-pricing.service.ts
│       └── appointment-import-processor.service.ts
├── infrastructure/
│   ├── repositories/
│   │   ├── prisma-appointment.repository.ts
│   │   └── prisma-appointment-import.repository.ts
│   └── jobs/
│       ├── appointment-import.job.ts
│       └── appointment-import.worker.ts
└── interfaces/
    ├── http/
    │   ├── appointment.routes.ts
    │   ├── appointment.controller.ts
    │   └── appointment.schemas.ts
    └── dtos/
        └── appointment-response.dto.ts
```

### 1.3 Dependencies (cross-module)

| Module | Dependency type | Purpose |
|---|---|---|
| `financial` | Event consumer / direct call | Create FinancialEntry on DONE |
| `notification` | Event consumer | Send notifications on status changes |
| `audit` | Direct call | Record every transition and sensitive operation |
| `service-group` | Event consumer | Publish/unpublish from marketplace |
| `property` | Direct call | Create or resolve property on appointment creation |
| `service-type` | Direct call | Resolve ServiceType and pricing rules |

---

## 2. Data Model

### 2.1 Prisma Schema

```prisma
// ============================================================
// ENUMS
// ============================================================

enum AppointmentStatus {
  DRAFT
  AWAITING_INSPECTOR
  SCHEDULED
  REJECTED
  CANCELLED
  DONE
}

enum TenantConfirmationStatus {
  PENDING
  CONFIRMED
  UNAVAILABLE
  NO_RESPONSE
}

enum RestrictionSource {
  TENANT_PORTAL
  OPERATOR
  IMPORT
}

enum PayoutType {
  FIXED
  PERCENTAGE
}

enum ServiceStatus {
  ACTIVE
  INACTIVE
}

enum ImportStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

// ============================================================
// SERVICE TYPE
// ============================================================

model ServiceType {
  id                        String          @id @default(uuid())
  code                      String          @unique
  name                      String
  flowType                  String          // "ROUTINE" | "INGOING" | "OUTGOING" | "OTHER"
  requiresTenantConfirmation Boolean        @default(true)
  status                    ServiceStatus   @default(ACTIVE)
  createdAt                 DateTime        @default(now()) @map("created_at")
  updatedAt                 DateTime        @updatedAt @map("updated_at")

  appointments              Appointment[]
  servicePriceRules         ServicePriceRule[]

  @@map("service_types")
}

// ============================================================
// SERVICE PRICE RULE
// ============================================================

model ServicePriceRule {
  id              String        @id @default(uuid())
  tenantId        String        @map("tenant_id")
  serviceTypeId   String        @map("service_type_id")
  branchId        String?       @map("branch_id")
  priceAmount     Decimal       @map("price_amount") @db.Decimal(10, 2)
  payoutType      PayoutType    @map("payout_type")
  payoutValue     Decimal       @map("payout_value") @db.Decimal(10, 4)
  bonusRuleJson   Json?         @map("bonus_rule_json")
  status          ServiceStatus @default(ACTIVE)
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  tenant          Tenant        @relation(fields: [tenantId], references: [id])
  serviceType     ServiceType   @relation(fields: [serviceTypeId], references: [id])
  branch          Branch?       @relation(fields: [branchId], references: [id])

  @@index([tenantId, serviceTypeId, branchId])
  @@map("service_price_rules")
}

// ============================================================
// APPOINTMENT
// ============================================================

model Appointment {
  id                       String                   @id @default(uuid())
  tenantId                 String                   @map("tenant_id")
  branchId                 String                   @map("branch_id")
  propertyId               String                   @map("property_id")
  serviceTypeId            String                   @map("service_type_id")
  serviceGroupId           String?                  @map("service_group_id")
  inspectorId              String?                  @map("inspector_id")
  status                   AppointmentStatus        @default(DRAFT)
  scheduledDate            DateTime                 @map("scheduled_date") @db.Date
  timeSlot                 String                   @map("time_slot")        // e.g. "08:00-10:00", "10:00-12:00"
  keyRequired              Boolean                  @default(false) @map("key_required")
  meetingLocationJson      Json?                    @map("meeting_location_json")
  keyLocationJson          Json?                    @map("key_location_json")
  tenantConfirmationStatus TenantConfirmationStatus @default(PENDING) @map("tenant_confirmation_status")
  rejectionReasonCode      String?                  @map("rejection_reason_code")
  cancellationReasonCode   String?                  @map("cancellation_reason_code")
  createdByUserId          String                   @map("created_by_user_id")
  doneCheckedByUserId      String?                  @map("done_checked_by_user_id")
  doneCheckedAt            DateTime?                @map("done_checked_at")
  priceAmount              Decimal                  @map("price_amount") @db.Decimal(10, 2)
  payoutAmount             Decimal                  @map("payout_amount") @db.Decimal(10, 2)
  pricingRuleSnapshotJson  Json                     @map("pricing_rule_snapshot_json")
  customFieldsJson         Json?                    @map("custom_fields_json")
  notes                    String?
  createdAt                DateTime                 @default(now()) @map("created_at")
  updatedAt                DateTime                 @updatedAt @map("updated_at")
  deletedAt                DateTime?                @map("deleted_at")

  tenant                   Tenant                   @relation(fields: [tenantId], references: [id])
  branch                   Branch                   @relation(fields: [branchId], references: [id])
  property                 Property                 @relation(fields: [propertyId], references: [id])
  serviceType              ServiceType              @relation(fields: [serviceTypeId], references: [id])
  serviceGroup             ServiceGroup?            @relation(fields: [serviceGroupId], references: [id])
  inspector                Inspector?               @relation(fields: [inspectorId], references: [id])
  createdByUser            User                     @relation("AppointmentCreatedBy", fields: [createdByUserId], references: [id])
  doneCheckedByUser        User?                    @relation("AppointmentDoneCheckedBy", fields: [doneCheckedByUserId], references: [id])

  contact                  AppointmentContact?
  restrictions             AppointmentRestriction[]
  auditLogs                AuditLog[]               @relation("AppointmentAuditLogs")
  notifications            Notification[]
  financialEntries         FinancialEntry[]

  @@index([tenantId, status])
  @@index([tenantId, branchId])
  @@index([tenantId, inspectorId])
  @@index([tenantId, scheduledDate])
  @@index([tenantId, serviceTypeId])
  @@index([serviceGroupId])
  @@map("appointments")
}

// ============================================================
// APPOINTMENT CONTACT
// ============================================================

model AppointmentContact {
  id               String      @id @default(uuid())
  appointmentId    String      @unique @map("appointment_id")
  tenantName       String      @map("tenant_name")
  primaryEmail     String      @map("primary_email")
  secondaryEmail   String?     @map("secondary_email")
  primaryPhone     String      @map("primary_phone")
  secondaryPhone   String?     @map("secondary_phone")
  createdAt        DateTime    @default(now()) @map("created_at")
  updatedAt        DateTime    @updatedAt @map("updated_at")

  appointment      Appointment @relation(fields: [appointmentId], references: [id])

  @@map("appointment_contacts")
}

// ============================================================
// APPOINTMENT RESTRICTION
// ============================================================

model AppointmentRestriction {
  id                  String            @id @default(uuid())
  appointmentId       String            @map("appointment_id")
  isHome              Boolean           @default(false) @map("is_home")
  unavailableDaysJson Json?             @map("unavailable_days_json")    // string[] e.g. ["2026-03-20", "2026-03-21"]
  unavailableHoursJson Json?            @map("unavailable_hours_json")   // string[] e.g. ["08:00-10:00"]
  notes               String?
  source              RestrictionSource
  createdAt           DateTime          @default(now()) @map("created_at")
  updatedAt           DateTime          @updatedAt @map("updated_at")

  appointment         Appointment       @relation(fields: [appointmentId], references: [id])

  @@index([appointmentId])
  @@map("appointment_restrictions")
}

// ============================================================
// APPOINTMENT IMPORT
// ============================================================

model AppointmentImport {
  id              String        @id @default(uuid())
  tenantId        String        @map("tenant_id")
  branchId        String        @map("branch_id")
  createdByUserId String        @map("created_by_user_id")
  status          ImportStatus  @default(PENDING)
  fileName        String        @map("file_name")
  fileKey         String        @map("file_key")           // storage object key
  totalRows       Int           @default(0) @map("total_rows")
  acceptedCount   Int           @default(0) @map("accepted_count")
  warningCount    Int           @default(0) @map("warning_count")
  errorCount      Int           @default(0) @map("error_count")
  resultJson      Json?         @map("result_json")        // per-row results
  errorMessage    String?       @map("error_message")
  idempotencyKey  String        @unique @map("idempotency_key")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  tenant          Tenant        @relation(fields: [tenantId], references: [id])
  branch          Branch        @relation(fields: [branchId], references: [id])

  @@index([tenantId])
  @@map("appointment_imports")
}
```

### 2.2 TypeScript entity types

```typescript
// src/modules/appointment/domain/enums/appointment-status.enum.ts
export enum AppointmentStatus {
  DRAFT = 'DRAFT',
  AWAITING_INSPECTOR = 'AWAITING_INSPECTOR',
  SCHEDULED = 'SCHEDULED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  DONE = 'DONE',
}

// src/modules/appointment/domain/enums/tenant-confirmation-status.enum.ts
export enum TenantConfirmationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  UNAVAILABLE = 'UNAVAILABLE',
  NO_RESPONSE = 'NO_RESPONSE',
}

// src/modules/appointment/domain/enums/restriction-source.enum.ts
export enum RestrictionSource {
  TENANT_PORTAL = 'TENANT_PORTAL',
  OPERATOR = 'OPERATOR',
  IMPORT = 'IMPORT',
}
```

### 2.3 Field definitions

#### Appointment fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID | Yes | Auto-generated |
| `tenantId` | UUID | Yes | FK to tenants, always scoped |
| `branchId` | UUID | Yes | FK to branches |
| `propertyId` | UUID | Yes | FK to properties |
| `serviceTypeId` | UUID | Yes | FK to service_types |
| `serviceGroupId` | UUID | No | FK to service_groups, set when grouped |
| `inspectorId` | UUID | No | FK to inspectors, set when SCHEDULED |
| `status` | AppointmentStatus | Yes | Default: DRAFT |
| `scheduledDate` | Date | Yes | Date only (no time) |
| `timeSlot` | String | Yes | e.g. "08:00-10:00" |
| `keyRequired` | Boolean | Yes | Default: false |
| `meetingLocationJson` | JSON | No | `{ address, notes }` |
| `keyLocationJson` | JSON | No | `{ address, keyNumber, notes }` |
| `tenantConfirmationStatus` | TenantConfirmationStatus | Yes | Default: PENDING |
| `rejectionReasonCode` | String | No | Populated on REJECTED transitions |
| `cancellationReasonCode` | String | No | Populated on CANCELLED transitions |
| `createdByUserId` | UUID | Yes | Actor who created |
| `doneCheckedByUserId` | UUID | No | OP or AM who cross-checked DONE |
| `doneCheckedAt` | DateTime | No | When DONE cross-check occurred |
| `priceAmount` | Decimal(10,2) | Yes | Snapshotted at creation |
| `payoutAmount` | Decimal(10,2) | Yes | Snapshotted at creation |
| `pricingRuleSnapshotJson` | JSON | Yes | Full rule snapshot at creation time |
| `customFieldsJson` | JSON | No | Extensible custom data |
| `notes` | String | No | Internal notes |
| `createdAt` | DateTime | Yes | Auto-managed |
| `updatedAt` | DateTime | Yes | Auto-managed |
| `deletedAt` | DateTime | No | Soft delete |

#### pricingRuleSnapshotJson structure

```typescript
interface PricingRuleSnapshot {
  ruleId: string;
  tenantId: string;
  serviceTypeId: string;
  branchId: string | null;
  priceAmount: string;        // decimal as string
  payoutType: 'FIXED' | 'PERCENTAGE';
  payoutValue: string;        // decimal as string
  bonusRuleJson: unknown | null;
  snapshotAt: string;         // ISO timestamp
}
```

#### meetingLocationJson / keyLocationJson structure

```typescript
interface LocationJson {
  address: string;
  notes?: string;
  keyNumber?: string;    // only for keyLocationJson
}
```

---

## 3. Use Cases

### 3.1 createAppointment

**File:** `src/modules/appointment/application/use-cases/create-appointment/create-appointment.use-case.ts`

**Actors:** OP, CL_ADMIN, CL_USER (with `create_appointments` permission), AM

**Description:** Creates a new appointment in DRAFT status. Snapshots pricing from ServicePriceRule at creation time. Optionally creates a Property inline.

#### Input DTO

```typescript
// create-appointment.dto.ts
import { z } from 'zod';

const ContactSchema = z.object({
  tenantName: z.string().min(1).max(255),
  primaryEmail: z.string().email(),
  secondaryEmail: z.string().email().optional(),
  primaryPhone: z.string().min(7).max(30),
  secondaryPhone: z.string().min(7).max(30).optional(),
});

const RestrictionSchema = z.object({
  isHome: z.boolean().default(false),
  unavailableDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  unavailableHours: z.array(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/)).optional(),
  notes: z.string().max(1000).optional(),
});

const LocationSchema = z.object({
  address: z.string().min(1).max(500),
  notes: z.string().max(500).optional(),
});

const KeyLocationSchema = LocationSchema.extend({
  keyNumber: z.string().max(100).optional(),
});

const InlinePropertySchema = z.object({
  propertyCode: z.string().max(100).optional(),
  type: z.string().min(1).max(100),
  street: z.string().min(1).max(255),
  addressLine2: z.string().max(255).optional(),
  suburb: z.string().min(1).max(100),
  postcode: z.string().min(1).max(20),
  state: z.string().min(1).max(100),
  country: z.string().min(1).max(100).default('Australia'),
  notes: z.string().max(1000).optional(),
});

export const CreateAppointmentDtoSchema = z.object({
  branchId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  property: InlinePropertySchema.optional(),
  serviceTypeId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),  // YYYY-MM-DD
  timeSlot: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
  contact: ContactSchema.optional(),
  restriction: RestrictionSchema.optional(),
  keyRequired: z.boolean().default(false),
  meetingLocation: LocationSchema.optional(),
  keyLocation: KeyLocationSchema.optional(),
  notes: z.string().max(2000).optional(),
  customFields: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.propertyId !== undefined || data.property !== undefined,
  { message: 'Either propertyId or property must be provided', path: ['propertyId'] }
).refine(
  (data) => !(data.propertyId !== undefined && data.property !== undefined),
  { message: 'Cannot provide both propertyId and property', path: ['propertyId'] }
);

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentDtoSchema>;
```

#### Processing steps

1. Validate input with `CreateAppointmentDtoSchema`.
2. Verify actor has permission to create appointments in target `branchId` (tenant scope check).
3. Resolve `serviceType` by `serviceTypeId` — error if not found or INACTIVE.
4. If `property` (inline) provided: call property module to create property, get back `propertyId`. If `propertyId` provided: verify property exists and belongs to same `tenantId`.
5. Resolve `ServicePriceRule`: find active rule for `(tenantId, serviceTypeId, branchId)`. If branch-specific not found, fall back to `(tenantId, serviceTypeId, null)`. Error if no rule found.
6. Compute `payoutAmount`:
   - If `payoutType === 'FIXED'`: `payoutAmount = payoutValue`
   - If `payoutType === 'PERCENTAGE'`: `payoutAmount = priceAmount * (payoutValue / 100)`, rounded to 2 decimal places
7. Snapshot `pricingRuleSnapshotJson` with current rule values + `snapshotAt = now()`.
8. Create `Appointment` record in DRAFT with all fields.
9. If `contact` provided: create `AppointmentContact` record.
10. If `restriction` provided: create `AppointmentRestriction` with `source = OPERATOR`.
11. Emit domain event `appointment.created.v1`.
12. Write audit log entry.
13. Return the created appointment.

#### Output

Full appointment object (see [Response Schema in section 4](#4-api-contracts)).

#### Errors

| Code | HTTP | Condition |
|---|---|---|
| `APPOINTMENT_BRANCH_NOT_FOUND` | 404 | branchId not found or not in tenant scope |
| `APPOINTMENT_PROPERTY_NOT_FOUND` | 404 | propertyId not found or not in tenant scope |
| `APPOINTMENT_SERVICE_TYPE_NOT_FOUND` | 404 | serviceTypeId not found |
| `APPOINTMENT_SERVICE_TYPE_INACTIVE` | 422 | ServiceType status is INACTIVE |
| `APPOINTMENT_NO_PRICE_RULE` | 422 | No active ServicePriceRule found |
| `APPOINTMENT_PROPERTY_TENANT_MISMATCH` | 403 | Property belongs to different tenant |
| `APPOINTMENT_BRANCH_TENANT_MISMATCH` | 403 | Branch belongs to different tenant |

---

### 3.2 listAppointments

**File:** `src/modules/appointment/application/use-cases/list-appointments/list-appointments.use-case.ts`

**Actors:** AM, OP, CL_ADMIN, CL_USER

**Description:** Returns a paginated, filterable list of appointments. AM and OP see all tenants; CL roles are scoped to their own tenant.

#### Input DTO

```typescript
// list-appointments.dto.ts
import { z } from 'zod';
import { AppointmentStatus } from '../../domain/enums/appointment-status.enum';
import { TenantConfirmationStatus } from '../../domain/enums/tenant-confirmation-status.enum';

export const ListAppointmentsDtoSchema = z.object({
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['scheduledDate', 'createdAt', 'updatedAt', 'status']).default('scheduledDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  // Filters
  status: z.nativeEnum(AppointmentStatus).optional(),
  serviceTypeId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  inspectorId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),             // searches property address, tenant name
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tenantConfirmationStatus: z.nativeEnum(TenantConfirmationStatus).optional(),
  // AM/OP only
  tenantId: z.string().uuid().optional(),
});

export type ListAppointmentsDto = z.infer<typeof ListAppointmentsDtoSchema>;
```

#### Processing steps

1. Validate input.
2. Determine tenant scope:
   - AM, OP: can filter by any `tenantId` or see all if omitted
   - CL_ADMIN, CL_USER: always scoped to their own `tenantId`; `tenantId` filter ignored/overridden
3. Build Prisma query with `where` clauses for all provided filters.
4. `search` matches (case-insensitive) against: property street, suburb, postcode, contact tenantName.
5. Apply pagination: `skip = (page - 1) * pageSize`, `take = pageSize`.
6. Return `{ data: Appointment[], meta: { page, pageSize, total, totalPages } }`.

#### Output

```typescript
interface ListAppointmentsResponse {
  data: AppointmentSummary[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

---

### 3.3 getAppointment

**File:** `src/modules/appointment/application/use-cases/get-appointment/get-appointment.use-case.ts`

**Actors:** AM, OP, CL_ADMIN, CL_USER, INSP (own assignments only)

**Description:** Returns full appointment details including contact, restrictions, audit history summary.

#### Processing steps

1. Find appointment by `id`.
2. Verify `deletedAt IS NULL`.
3. Enforce scope:
   - AM, OP: any tenant
   - CL_ADMIN, CL_USER: must match actor's `tenantId`
   - INSP: `inspectorId` must match actor's inspector id
4. Return full appointment with related `contact` and `restrictions`.

#### Errors

| Code | HTTP | Condition |
|---|---|---|
| `APPOINTMENT_NOT_FOUND` | 404 | Not found or soft-deleted |
| `APPOINTMENT_ACCESS_DENIED` | 403 | Tenant mismatch or inspector not assigned |

---

### 3.4 updateAppointment

**File:** `src/modules/appointment/application/use-cases/update-appointment/update-appointment.use-case.ts`

**Actors:** OP, CL_ADMIN, CL_USER (with `reschedule_appointments` permission when changing date/time), AM

**Description:** Updates mutable fields of an appointment. Only allowed when status is DRAFT or AWAITING_INSPECTOR.

#### Input DTO

```typescript
// update-appointment.dto.ts
import { z } from 'zod';

const ContactUpdateSchema = z.object({
  tenantName: z.string().min(1).max(255).optional(),
  primaryEmail: z.string().email().optional(),
  secondaryEmail: z.string().email().nullable().optional(),
  primaryPhone: z.string().min(7).max(30).optional(),
  secondaryPhone: z.string().min(7).max(30).nullable().optional(),
});

const RestrictionUpdateSchema = z.object({
  isHome: z.boolean().optional(),
  unavailableDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  unavailableHours: z.array(z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/)).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const LocationSchema = z.object({
  address: z.string().min(1).max(500),
  notes: z.string().max(500).optional(),
});

const KeyLocationSchema = LocationSchema.extend({
  keyNumber: z.string().max(100).optional(),
});

export const UpdateAppointmentDtoSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeSlot: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(),
  keyRequired: z.boolean().optional(),
  meetingLocation: LocationSchema.nullable().optional(),
  keyLocation: KeyLocationSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  contact: ContactUpdateSchema.optional(),
  restriction: RestrictionUpdateSchema.optional(),
  customFields: z.record(z.unknown()).nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export type UpdateAppointmentDto = z.infer<typeof UpdateAppointmentDtoSchema>;
```

#### Processing steps

1. Validate input.
2. Find appointment, verify existence and tenant scope.
3. Guard: status must be `DRAFT` or `AWAITING_INSPECTOR`. Otherwise → `APPOINTMENT_UPDATE_NOT_ALLOWED`.
4. If `scheduledDate` or `timeSlot` is changing:
   - Check rescheduling window: cannot reschedule past 7:00 PM the day before the current `scheduledDate` unless actor is OP or AM.
   - New `scheduledDate` must not exceed 30 days from original `scheduledDate`.
   - Check actor rescheduling permission by service type (see Business Rules section 5.4).
5. Update appointment fields.
6. If `contact` provided: upsert `AppointmentContact`.
7. If `restriction` provided: upsert `AppointmentRestriction` with `source = OPERATOR`.
8. Write audit log entry with changed fields.
9. Return updated appointment.

#### Errors

| Code | HTTP | Condition |
|---|---|---|
| `APPOINTMENT_NOT_FOUND` | 404 | Not found |
| `APPOINTMENT_UPDATE_NOT_ALLOWED` | 422 | Status not DRAFT or AWAITING_INSPECTOR |
| `APPOINTMENT_RESCHEDULE_WINDOW_EXPIRED` | 422 | Past 7:00 PM cutoff for non-OP actors |
| `APPOINTMENT_RESCHEDULE_MAX_DATE_EXCEEDED` | 422 | New date > 30 days from original |
| `APPOINTMENT_RESCHEDULE_NOT_PERMITTED` | 403 | Actor not permitted to reschedule this service type |

---

### 3.5 executeStatusTransition

**File:** `src/modules/appointment/application/use-cases/execute-status-transition/execute-status-transition.use-case.ts`

**Actors:** Varies by transition (see Authorization Matrix section 6)

**Description:** Executes a formal status transition on the appointment. Requires `Idempotency-Key` header. Validates actor, current status, reason requirements, and triggers all side effects.

#### Input DTO

```typescript
// execute-status-transition.dto.ts
import { z } from 'zod';
import { AppointmentStatus } from '../../domain/enums/appointment-status.enum';

export const ExecuteStatusTransitionDtoSchema = z.object({
  targetStatus: z.nativeEnum(AppointmentStatus),
  reason: z.string().min(1).max(2000).optional(),
  // For DONE transition only
  doneCheckedByUserId: z.string().uuid().optional(),
  // For AWAITING_INSPECTOR transition (manual assignment)
  inspectorId: z.string().uuid().optional(),
});

export type ExecuteStatusTransitionDto = z.infer<typeof ExecuteStatusTransitionDtoSchema>;

// Context passed from HTTP layer (extracted from JWT)
export interface TransitionContext {
  actorId: string;
  actorRole: 'AM' | 'OP' | 'CL_ADMIN' | 'CL_USER' | 'INSP' | 'SYS';
  tenantId: string;
  idempotencyKey: string;
  requestId: string;
}
```

#### State machine definition

```typescript
// src/modules/appointment/application/services/appointment-state-machine.service.ts

import { AppointmentStatus } from '../../domain/enums/appointment-status.enum';

type ActorRole = 'AM' | 'OP' | 'CL_ADMIN' | 'CL_USER' | 'INSP' | 'SYS';

interface TransitionRule {
  from: AppointmentStatus;
  to: AppointmentStatus;
  allowedActors: ActorRole[];
  requiresReason: boolean;
  requiresDoneCheckedBy?: boolean;  // only for DONE transition
}

export const TRANSITION_RULES: TransitionRule[] = [
  {
    from: AppointmentStatus.DRAFT,
    to: AppointmentStatus.AWAITING_INSPECTOR,
    allowedActors: ['OP', 'SYS', 'AM'],
    requiresReason: false,
  },
  {
    from: AppointmentStatus.DRAFT,
    to: AppointmentStatus.REJECTED,
    allowedActors: ['OP', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.DRAFT,
    to: AppointmentStatus.CANCELLED,
    allowedActors: ['OP', 'CL_ADMIN', 'CL_USER', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.AWAITING_INSPECTOR,
    to: AppointmentStatus.SCHEDULED,
    allowedActors: ['SYS', 'OP', 'AM'],
    requiresReason: false,
  },
  {
    from: AppointmentStatus.AWAITING_INSPECTOR,
    to: AppointmentStatus.CANCELLED,
    allowedActors: ['OP', 'CL_ADMIN', 'CL_USER', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.AWAITING_INSPECTOR,
    to: AppointmentStatus.REJECTED,
    allowedActors: ['OP', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.SCHEDULED,
    to: AppointmentStatus.DONE,
    allowedActors: ['INSP', 'OP', 'AM'],
    requiresReason: false,
    requiresDoneCheckedBy: true,
  },
  {
    from: AppointmentStatus.SCHEDULED,
    to: AppointmentStatus.CANCELLED,
    allowedActors: ['OP', 'CL_ADMIN', 'CL_USER', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.SCHEDULED,
    to: AppointmentStatus.REJECTED,
    allowedActors: ['OP', 'SYS', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.REJECTED,
    to: AppointmentStatus.DRAFT,
    allowedActors: ['OP', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.REJECTED,
    to: AppointmentStatus.AWAITING_INSPECTOR,
    allowedActors: ['OP', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.CANCELLED,
    to: AppointmentStatus.DRAFT,
    allowedActors: ['OP', 'AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.DONE,
    to: AppointmentStatus.DRAFT,
    allowedActors: ['AM'],
    requiresReason: true,
  },
  {
    from: AppointmentStatus.DONE,
    to: AppointmentStatus.REJECTED,
    allowedActors: ['AM'],
    requiresReason: true,
  },
];
```

#### Processing steps

1. Extract `Idempotency-Key` from request header. If missing → `IDEMPOTENCY_KEY_REQUIRED` (400).
2. Check idempotency store: if key already exists:
   - Same payload hash → return cached response (200)
   - Different payload hash → `IDEMPOTENCY_KEY_CONFLICT` (409)
3. Find appointment by `appointmentId`. Verify existence and tenant scope.
4. Validate transition is defined in `TRANSITION_RULES` for `(current status → targetStatus)`.
5. Validate actor role is in `allowedActors` for the transition.
6. For `CL_USER` on CANCELLED transitions: verify actor has `cancel_appointments` permission in tenant settings.
7. If `requiresReason === true`: verify `reason` is provided. Otherwise → `APPOINTMENT_REASON_REQUIRED` (422).
8. For `SCHEDULED → DONE`: verify `doneCheckedByUserId` is provided and is OP or AM. Otherwise → `APPOINTMENT_DONE_CHECK_REQUIRED` (422).
9. For `AWAITING_INSPECTOR → SCHEDULED` (manual assignment): verify `inspectorId` is provided.
10. Execute transition-specific side effects (see below).
11. Update appointment `status` and any related fields.
12. Write audit log with `from_status`, `to_status`, `actor`, `reason`, timestamp.
13. Store idempotency key with response.
14. Emit domain event for the transition.
15. Return updated appointment.

#### Side effects by transition

**DRAFT → AWAITING_INSPECTOR:**
- Emit `appointment.released.v1`
- Queue job to publish to service group marketplace if applicable

**AWAITING_INSPECTOR → SCHEDULED:**
- Set `inspectorId` on appointment
- Emit `appointment.scheduled.v1`
- Queue notification job: confirmation email to tenant (if Routine) and inspector

**SCHEDULED → DONE:**
- Set `doneCheckedByUserId` and `doneCheckedAt`
- Emit `appointment.done.v1`
- Queue financial job: create TENANT_DEBIT and INSPECTOR_PAYOUT entries
- Queue notification jobs: completion confirmation

**SCHEDULED → CANCELLED / AWAITING_INSPECTOR → CANCELLED / DRAFT → CANCELLED:**
- Set `cancellationReasonCode = reason`
- Emit `appointment.cancelled.v1`
- Queue notification job: cancellation email

**SCHEDULED → REJECTED / AWAITING_INSPECTOR → REJECTED / DRAFT → REJECTED:**
- Set `rejectionReasonCode = reason`
- Emit `appointment.rejected.v1`

**REJECTED → DRAFT / CANCELLED → DRAFT:**
- Clear `rejectionReasonCode` or `cancellationReasonCode`
- Emit `appointment.reopened.v1`

**REJECTED → AWAITING_INSPECTOR:**
- Clear `rejectionReasonCode`
- Emit `appointment.released.v1` (direct reopen)

**DONE → DRAFT:**
- Emit `appointment.done_reopened.v1` (requires reinforced audit)
- Queue financial review job

**DONE → REJECTED:**
- Set `rejectionReasonCode = reason`
- Emit `appointment.done_rejected.v1`
- Queue financial adjustment/refund evaluation job

#### Errors

| Code | HTTP | Condition |
|---|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Missing Idempotency-Key header |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Same key, different payload |
| `APPOINTMENT_NOT_FOUND` | 404 | Not found |
| `APPOINTMENT_INVALID_TRANSITION` | 422 | Transition not defined in state machine |
| `APPOINTMENT_TRANSITION_NOT_PERMITTED` | 403 | Actor role not in allowedActors |
| `APPOINTMENT_REASON_REQUIRED` | 422 | Reason missing for sensitive transition |
| `APPOINTMENT_DONE_CHECK_REQUIRED` | 422 | doneCheckedByUserId missing for DONE |
| `APPOINTMENT_DONE_CHECKER_INVALID_ROLE` | 422 | doneCheckedByUserId not OP or AM |
| `APPOINTMENT_INSPECTOR_REQUIRED` | 422 | inspectorId missing for manual SCHEDULED |
| `APPOINTMENT_CANCEL_PERMISSION_DENIED` | 403 | CL_USER lacks cancel_appointments permission |

---

### 3.6 importAppointments

**File:** `src/modules/appointment/application/use-cases/import-appointments/import-appointments.use-case.ts`

**Actors:** OP, CL_ADMIN, AM

**Description:** Accepts a multipart XLSX or CSV file upload, validates it synchronously (column presence, row count), enqueues an async pg-boss job for row-level processing, and returns an import ticket immediately.

#### Input

- `Idempotency-Key` header: required
- `branchId` (form field): target branch for all appointments
- `file` (multipart): XLSX or CSV, max 10 MB, max 1000 rows

#### Required spreadsheet columns (case-insensitive header matching)

| Column name | Notes |
|---|---|
| `Service` | Must match a known ServiceType code or name |
| `Property code` | Optional |
| `Date` | Format: DD/MM/YYYY or YYYY-MM-DD |
| `Hour` | Format: HH:MM (24h) |
| `Time Slot` | e.g. "08:00-10:00" |
| `Street` | Required |
| `Suburb` | Required |
| `Postcode` | Required, validated format |
| `State` | Required |
| `Country` | Optional, default "Australia" |
| `Address line 2` | Optional |
| `Notes` | Optional |
| `Realty description` | Optional |
| `Tenant name` | Optional for Ingoing/Outgoing |
| `Tenant mail` | Optional for Ingoing/Outgoing |
| `Tenant phone` | Optional for Ingoing/Outgoing |
| `PHONE: Tenant secondary phone` | Optional |
| `EMAIL: Tenant secondary mail` | Optional |
| `OTHER: Key number` | Optional, sets `keyRequired = true` if present |

#### Processing steps (synchronous — HTTP handler)

1. Extract `Idempotency-Key`. If missing → `IDEMPOTENCY_KEY_REQUIRED` (400).
2. Check idempotency store.
3. Validate actor permission.
4. Verify `branchId` in tenant scope.
5. Parse multipart; extract file buffer and metadata.
6. Validate file type (`.xlsx` or `.csv`). If invalid → `IMPORT_INVALID_FILE_TYPE` (422).
7. Validate file size ≤ 10 MB. If exceeded → `IMPORT_FILE_TOO_LARGE` (422).
8. Parse file headers. Verify all required columns are present. If missing → `IMPORT_MISSING_COLUMNS` (422) with `details.missingColumns`.
9. Count rows. If > 1000 → `IMPORT_TOO_MANY_ROWS` (422).
10. Store file to Supabase Storage under key `imports/{tenantId}/{importId}/{filename}`.
11. Create `AppointmentImport` record with status `PENDING`.
12. Enqueue pg-boss job `appointment.import` with `{ importId, tenantId, branchId, actorId, requestId }`.
13. Store idempotency key → `{ importId }`.
14. Return `{ importId, status: 'PENDING', acceptedCount: 0, warningCount: 0, errorCount: 0 }`.

#### Async processing (pg-boss worker — see section 8)

Per-row validation and appointment creation happens in the worker.

#### Row-level validation rules

**Hard errors (reject row):**

| Rule | Error code |
|---|---|
| `Service` value does not match any ServiceType | `ROW_INVALID_SERVICE` |
| `Street` is empty | `ROW_STREET_REQUIRED` |
| `Suburb` is empty | `ROW_SUBURB_REQUIRED` |
| `Postcode` is empty or invalid format | `ROW_POSTCODE_INVALID` |
| `State` is empty | `ROW_STATE_REQUIRED` |
| `Date` is empty or invalid format | `ROW_DATE_INVALID` |
| `Hour` is empty or invalid format | `ROW_HOUR_INVALID` |
| Routine service type with missing `Tenant phone` | `ROW_TENANT_PHONE_REQUIRED` |
| Routine service type with missing `Tenant mail` | `ROW_TENANT_EMAIL_REQUIRED` |
| No active `ServicePriceRule` for service type | `ROW_NO_PRICE_RULE` |

**Warnings (import with flag):**

| Rule | Warning code |
|---|---|
| `Tenant phone` present but invalid format | `WARN_TENANT_PHONE_INVALID` |
| `Tenant mail` present but invalid email | `WARN_TENANT_EMAIL_INVALID` |
| `Tenant name` is empty (Routine) | `WARN_TENANT_NAME_MISSING` |
| Geocoding failed for the address | `WARN_GEOCODING_FAILED` |
| Deduplication match found (same address + service type + within 3 months) | `WARN_POSSIBLE_DUPLICATE` |

#### Output

```typescript
interface ImportAppointmentsResponse {
  importId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  acceptedCount: number;
  warningCount: number;
  errorCount: number;
}
```

#### Errors

| Code | HTTP | Condition |
|---|---|---|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Missing header |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Same key, different payload |
| `IMPORT_INVALID_FILE_TYPE` | 422 | Not XLSX or CSV |
| `IMPORT_FILE_TOO_LARGE` | 422 | File > 10 MB |
| `IMPORT_MISSING_COLUMNS` | 422 | Required header columns missing |
| `IMPORT_TOO_MANY_ROWS` | 422 | Row count > 1000 |
| `IMPORT_BRANCH_NOT_FOUND` | 404 | branchId invalid or out of scope |

---

### 3.7 forceManualTenantConfirmation

**File:** `src/modules/appointment/application/use-cases/force-manual-tenant-confirmation/force-manual-tenant-confirmation.use-case.ts`

**Actors:** OP, AM, CL_USER (with explicit `force_confirmation` permission)

**Description:** Overrides tenant confirmation status to CONFIRMED without tenant portal response. Creates audit log and triggers T-1 visibility in inspector app.

#### Input DTO

```typescript
// force-manual-tenant-confirmation.dto.ts
import { z } from 'zod';

export const ForceManualTenantConfirmationDtoSchema = z.object({
  reason: z.string().min(1).max(2000),
  confirmedByUserId: z.string().uuid(),
});

export type ForceManualTenantConfirmationDto = z.infer<typeof ForceManualTenantConfirmationDtoSchema>;
```

#### Processing steps

1. Validate input.
2. Find appointment by `appointmentId`. Verify existence and tenant scope.
3. Verify status is `SCHEDULED` (confirmation is only meaningful in SCHEDULED).
4. Verify `serviceType.requiresTenantConfirmation === true` (Routine). Warn if not Routine but still allow (OP/AM override).
5. Verify actor permission.
6. Set `tenantConfirmationStatus = CONFIRMED`.
7. Write audit log: `FORCE_MANUAL_CONFIRMATION`, actor, reason, timestamp.
8. Emit `appointment.confirmation.forced.v1`.
9. Return updated appointment.

#### Errors

| Code | HTTP | Condition |
|---|---|---|
| `APPOINTMENT_NOT_FOUND` | 404 | Not found |
| `APPOINTMENT_INVALID_STATUS_FOR_CONFIRMATION` | 422 | Status is not SCHEDULED |
| `APPOINTMENT_FORCE_CONFIRM_NOT_PERMITTED` | 403 | Actor lacks permission |

---

## 4. API Contracts

### 4.1 Endpoint summary

| Method | Path | Use case | Auth required |
|---|---|---|---|
| `POST` | `/v1/appointments` | createAppointment | Yes |
| `GET` | `/v1/appointments` | listAppointments | Yes |
| `GET` | `/v1/appointments/:appointmentId` | getAppointment | Yes |
| `PATCH` | `/v1/appointments/:appointmentId` | updateAppointment | Yes |
| `POST` | `/v1/appointments/:appointmentId/status-transitions` | executeStatusTransition | Yes |
| `POST` | `/v1/appointments/import` | importAppointments | Yes |
| `GET` | `/v1/appointments/import/:importId` | getImportStatus | Yes |
| `POST` | `/v1/appointments/:appointmentId/force-confirmation` | forceManualTenantConfirmation | Yes |

### 4.2 Common headers

```
Authorization: Bearer <jwt>
X-Request-ID: <uuid>            // mandatory on all requests
Content-Type: application/json  // except import (multipart/form-data)
```

### 4.3 POST /v1/appointments

**Request:**

```json
{
  "branchId": "uuid",
  "propertyId": "uuid",
  "serviceTypeId": "uuid",
  "scheduledDate": "2026-04-15",
  "timeSlot": "08:00-10:00",
  "keyRequired": false,
  "notes": "Please call before arriving",
  "contact": {
    "tenantName": "John Smith",
    "primaryEmail": "john.smith@example.com",
    "primaryPhone": "+61412345678"
  },
  "restriction": {
    "isHome": true,
    "unavailableDays": ["2026-04-16"],
    "unavailableHours": ["08:00-10:00"]
  },
  "meetingLocation": {
    "address": "Front door on street level"
  },
  "keyLocation": {
    "address": "Key box at office",
    "keyNumber": "1234"
  }
}
```

**OR with inline property:**

```json
{
  "branchId": "uuid",
  "property": {
    "type": "Apartment",
    "street": "123 Main Street",
    "suburb": "Sydney",
    "postcode": "2000",
    "state": "NSW",
    "country": "Australia"
  },
  "serviceTypeId": "uuid",
  "scheduledDate": "2026-04-15",
  "timeSlot": "08:00-10:00"
}
```

**Response 201:**

```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "branchId": "uuid",
  "propertyId": "uuid",
  "serviceTypeId": "uuid",
  "serviceGroupId": null,
  "inspectorId": null,
  "status": "DRAFT",
  "scheduledDate": "2026-04-15",
  "timeSlot": "08:00-10:00",
  "keyRequired": false,
  "tenantConfirmationStatus": "PENDING",
  "rejectionReasonCode": null,
  "cancellationReasonCode": null,
  "priceAmount": "150.00",
  "payoutAmount": "75.00",
  "notes": "Please call before arriving",
  "createdByUserId": "uuid",
  "doneCheckedByUserId": null,
  "doneCheckedAt": null,
  "meetingLocationJson": { "address": "Front door on street level" },
  "keyLocationJson": null,
  "pricingRuleSnapshotJson": {
    "ruleId": "uuid",
    "tenantId": "uuid",
    "serviceTypeId": "uuid",
    "branchId": null,
    "priceAmount": "150.00",
    "payoutType": "PERCENTAGE",
    "payoutValue": "50.0000",
    "bonusRuleJson": null,
    "snapshotAt": "2026-03-15T10:00:00.000Z"
  },
  "contact": {
    "id": "uuid",
    "tenantName": "John Smith",
    "primaryEmail": "john.smith@example.com",
    "secondaryEmail": null,
    "primaryPhone": "+61412345678",
    "secondaryPhone": null
  },
  "restrictions": [
    {
      "id": "uuid",
      "isHome": true,
      "unavailableDays": ["2026-04-16"],
      "unavailableHours": ["08:00-10:00"],
      "notes": null,
      "source": "OPERATOR"
    }
  ],
  "createdAt": "2026-03-15T10:00:00.000Z",
  "updatedAt": "2026-03-15T10:00:00.000Z"
}
```

**Error responses:**

```json
// 404 - property not found
{
  "error": {
    "code": "APPOINTMENT_PROPERTY_NOT_FOUND",
    "message": "Property not found",
    "details": { "propertyId": "uuid" }
  }
}

// 422 - no price rule
{
  "error": {
    "code": "APPOINTMENT_NO_PRICE_RULE",
    "message": "No active pricing rule found for this service type and branch",
    "details": { "serviceTypeId": "uuid", "branchId": "uuid" }
  }
}
```

---

### 4.4 GET /v1/appointments

**Query parameters:** `page`, `pageSize`, `sortBy`, `sortOrder`, `status`, `serviceTypeId`, `branchId`, `inspectorId`, `search`, `fromDate`, `toDate`, `tenantConfirmationStatus`, `tenantId` (AM/OP only)

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "branchId": "uuid",
      "propertyId": "uuid",
      "serviceTypeId": "uuid",
      "inspectorId": null,
      "status": "DRAFT",
      "scheduledDate": "2026-04-15",
      "timeSlot": "08:00-10:00",
      "keyRequired": false,
      "tenantConfirmationStatus": "PENDING",
      "priceAmount": "150.00",
      "payoutAmount": "75.00",
      "contact": {
        "tenantName": "John Smith",
        "primaryEmail": "john.smith@example.com",
        "primaryPhone": "+61412345678"
      },
      "createdAt": "2026-03-15T10:00:00.000Z",
      "updatedAt": "2026-03-15T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 142,
    "totalPages": 8
  }
}
```

---

### 4.5 GET /v1/appointments/:appointmentId

**Response 200:** Full appointment object (same as create response with all fields).

**Error:**

```json
// 404
{
  "error": {
    "code": "APPOINTMENT_NOT_FOUND",
    "message": "Appointment not found",
    "details": {}
  }
}
```

---

### 4.6 PATCH /v1/appointments/:appointmentId

**Request:**

```json
{
  "scheduledDate": "2026-04-20",
  "timeSlot": "10:00-12:00",
  "notes": "Updated notes",
  "contact": {
    "primaryPhone": "+61412999888"
  }
}
```

**Response 200:** Updated full appointment object.

---

### 4.7 POST /v1/appointments/:appointmentId/status-transitions

**Headers required:** `Idempotency-Key: <unique-uuid>`

**Request (AWAITING_INSPECTOR → SCHEDULED with manual assignment):**

```json
{
  "targetStatus": "SCHEDULED",
  "inspectorId": "uuid"
}
```

**Request (SCHEDULED → DONE):**

```json
{
  "targetStatus": "DONE",
  "doneCheckedByUserId": "uuid"
}
```

**Request (any → CANCELLED):**

```json
{
  "targetStatus": "CANCELLED",
  "reason": "Client cancelled due to property settlement"
}
```

**Request (DONE → DRAFT, AM only):**

```json
{
  "targetStatus": "DRAFT",
  "reason": "Inspection report was invalid, needs to be redone"
}
```

**Response 200:** Updated full appointment object.

**Error responses:**

```json
// 400 - missing idempotency key
{
  "error": {
    "code": "IDEMPOTENCY_KEY_REQUIRED",
    "message": "Idempotency-Key header is required",
    "details": {}
  }
}

// 409 - idempotency conflict
{
  "error": {
    "code": "IDEMPOTENCY_KEY_CONFLICT",
    "message": "This idempotency key was used with a different request payload",
    "details": {}
  }
}

// 422 - invalid transition
{
  "error": {
    "code": "APPOINTMENT_INVALID_TRANSITION",
    "message": "Cannot transition from DONE to SCHEDULED",
    "details": {
      "currentStatus": "DONE",
      "targetStatus": "SCHEDULED"
    }
  }
}

// 403 - transition not permitted for role
{
  "error": {
    "code": "APPOINTMENT_TRANSITION_NOT_PERMITTED",
    "message": "Your role is not permitted to perform this transition",
    "details": {
      "role": "CL_ADMIN",
      "targetStatus": "REJECTED"
    }
  }
}

// 422 - reason required
{
  "error": {
    "code": "APPOINTMENT_REASON_REQUIRED",
    "message": "A reason is required for this transition",
    "details": {
      "targetStatus": "CANCELLED"
    }
  }
}
```

---

### 4.8 POST /v1/appointments/import

**Headers required:**
- `Idempotency-Key: <unique-uuid>`
- `Content-Type: multipart/form-data`

**Request (multipart form):**
- `branchId` (text field): target branch UUID
- `file` (file field): XLSX or CSV file

**Response 202:**

```json
{
  "importId": "uuid",
  "status": "PENDING",
  "acceptedCount": 0,
  "warningCount": 0,
  "errorCount": 0
}
```

---

### 4.9 GET /v1/appointments/import/:importId

**Response 200:**

```json
{
  "importId": "uuid",
  "status": "COMPLETED",
  "fileName": "appointments-march.xlsx",
  "totalRows": 50,
  "acceptedCount": 47,
  "warningCount": 3,
  "errorCount": 0,
  "results": [
    {
      "row": 1,
      "status": "ACCEPTED",
      "appointmentId": "uuid",
      "warnings": []
    },
    {
      "row": 5,
      "status": "WARNING",
      "appointmentId": "uuid",
      "warnings": [
        { "code": "WARN_TENANT_PHONE_INVALID", "message": "Tenant phone format is invalid" }
      ]
    }
  ],
  "createdAt": "2026-03-15T10:00:00.000Z",
  "updatedAt": "2026-03-15T10:05:30.000Z"
}
```

---

### 4.10 POST /v1/appointments/:appointmentId/force-confirmation

**Request:**

```json
{
  "reason": "Tenant confirmed via phone call on 15/03/2026",
  "confirmedByUserId": "uuid"
}
```

**Response 200:** Updated full appointment object with `tenantConfirmationStatus: "CONFIRMED"`.

---

### 4.11 Complete error code registry

| Code | HTTP Status | Description |
|---|---|---|
| `APPOINTMENT_NOT_FOUND` | 404 | Appointment does not exist or was deleted |
| `APPOINTMENT_BRANCH_NOT_FOUND` | 404 | Branch not found |
| `APPOINTMENT_PROPERTY_NOT_FOUND` | 404 | Property not found |
| `APPOINTMENT_SERVICE_TYPE_NOT_FOUND` | 404 | ServiceType not found |
| `APPOINTMENT_SERVICE_TYPE_INACTIVE` | 422 | ServiceType is not ACTIVE |
| `APPOINTMENT_NO_PRICE_RULE` | 422 | No active ServicePriceRule exists |
| `APPOINTMENT_PROPERTY_TENANT_MISMATCH` | 403 | Property belongs to different tenant |
| `APPOINTMENT_BRANCH_TENANT_MISMATCH` | 403 | Branch belongs to different tenant |
| `APPOINTMENT_ACCESS_DENIED` | 403 | Actor not authorized to view appointment |
| `APPOINTMENT_UPDATE_NOT_ALLOWED` | 422 | Status does not permit updates |
| `APPOINTMENT_RESCHEDULE_WINDOW_EXPIRED` | 422 | Past 7PM cutoff for non-OP actors |
| `APPOINTMENT_RESCHEDULE_MAX_DATE_EXCEEDED` | 422 | New date > 30 days from original |
| `APPOINTMENT_RESCHEDULE_NOT_PERMITTED` | 403 | Actor not permitted to reschedule |
| `APPOINTMENT_INVALID_TRANSITION` | 422 | Transition not in state machine |
| `APPOINTMENT_TRANSITION_NOT_PERMITTED` | 403 | Actor role not allowed for transition |
| `APPOINTMENT_REASON_REQUIRED` | 422 | Reason missing for sensitive transition |
| `APPOINTMENT_DONE_CHECK_REQUIRED` | 422 | doneCheckedByUserId missing for DONE |
| `APPOINTMENT_DONE_CHECKER_INVALID_ROLE` | 422 | Checker is not OP or AM |
| `APPOINTMENT_INSPECTOR_REQUIRED` | 422 | inspectorId missing for manual SCHEDULED |
| `APPOINTMENT_CANCEL_PERMISSION_DENIED` | 403 | CL_USER lacks cancel permission |
| `APPOINTMENT_INVALID_STATUS_FOR_CONFIRMATION` | 422 | Not SCHEDULED for force confirmation |
| `APPOINTMENT_FORCE_CONFIRM_NOT_PERMITTED` | 403 | Actor lacks force confirmation permission |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Idempotency-Key header missing |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | Key used with different payload |
| `IMPORT_INVALID_FILE_TYPE` | 422 | File is not XLSX or CSV |
| `IMPORT_FILE_TOO_LARGE` | 422 | File exceeds 10 MB |
| `IMPORT_MISSING_COLUMNS` | 422 | Required header columns absent |
| `IMPORT_TOO_MANY_ROWS` | 422 | Row count exceeds 1000 |
| `IMPORT_BRANCH_NOT_FOUND` | 404 | Branch not found for import |
| `IMPORT_NOT_FOUND` | 404 | ImportId not found |

---

## 5. Business Rules

### 5.1 Creation rules

**BR-01** Every appointment starts in `DRAFT` status.

**BR-02** `tenantId` is always derived from the authenticated actor's JWT claim. It can never be supplied by the request body.

**BR-03** `branchId` must belong to the actor's tenant (or any tenant for AM/OP).

**BR-04** `propertyId` must belong to the same tenant as the appointment.

**BR-05** Exactly one of `propertyId` or `property` (inline) must be provided.

**BR-06** `serviceTypeId` must reference an ACTIVE ServiceType.

**BR-07** A `ServicePriceRule` must exist and be ACTIVE for the combination `(tenantId, serviceTypeId)`. Branch-specific rule takes precedence over tenant-wide rule.

**BR-08** `priceAmount` and `payoutAmount` are snapshotted at creation time from the ServicePriceRule and never modified after creation (except by AM manual adjustment via financial module).

**BR-09** `pricingRuleSnapshotJson` stores the full rule at creation time with a `snapshotAt` timestamp.

**BR-10** `tenantConfirmationStatus` defaults to `PENDING` for all service types.

**BR-11** `createdByUserId` is always set to the authenticated actor's user ID.

### 5.2 Status machine rules

**BR-12** Only transitions defined in the TRANSITION_RULES table (14 total) are valid. Any other combination must be rejected with `APPOINTMENT_INVALID_TRANSITION`.

**BR-13** Every transition must be executed by an actor whose role is in the `allowedActors` list for that transition.

**BR-14** Every transition must produce an audit log entry recording: `appointmentId`, `fromStatus`, `toStatus`, `actorId`, `actorRole`, `reason` (if applicable), `requestId`, `createdAt`.

**BR-15** System (SYS) transitions (e.g., marketplace acceptance) must record a system event identifying the originating job or service.

**BR-16** `Idempotency-Key` is mandatory for all status transition requests. Same key + same payload hash = idempotent success. Same key + different payload = 409 conflict.

**BR-17** Idempotency keys are stored per `(tenantId, idempotencyKey)` and must not be shared across tenants.

### 5.3 DONE transition rules

**BR-18** `SCHEDULED → DONE` requires a `doneCheckedByUserId`. This user must have role OP or AM.

**BR-19** `doneCheckedByUserId` cannot be the same as the `inspectorId` on the appointment.

**BR-20** Upon DONE transition, two financial entries must be created synchronously (or via a reliable job):
  - `TENANT_DEBIT` with `amount = priceAmount` charged to the appointment's tenant
  - `INSPECTOR_PAYOUT` with `amount = payoutAmount` paid to the assigned inspector

**BR-21** Financial entries on DONE must be idempotent (use `appointmentId` as natural key to prevent double-entry).

### 5.4 Rescheduling rules

**BR-22** Rescheduling (changing `scheduledDate` or `timeSlot`) is only permitted in `DRAFT` and `AWAITING_INSPECTOR` by CL roles and OP. In `SCHEDULED`, rules vary by service type.

**BR-23** For `SCHEDULED` status:
  - Routine Inspection: TNT (via tenant portal) = Yes; OP = Yes; CL = No
  - Ingoing Inspection: CL = Yes; OP = Yes; TNT = No
  - Outgoing Inspection: CL = Yes; OP = Yes; TNT = No

**BR-24** Rescheduling cutoff: 7:00 PM (19:00) the day before `scheduledDate` in the tenant's configured timezone. After this cutoff, only OP or AM can reschedule.

**BR-25** Maximum rescheduling window: new `scheduledDate` cannot be more than 30 days after the original `scheduledDate`. Beyond this, cancel and create new appointment.

**BR-26** TNT cannot reschedule via the `PATCH /v1/appointments/:id` endpoint. TNT rescheduling is only through the tenant portal endpoint (`POST /v1/tenant-portal/:token/reschedule`).

### 5.5 Tenant confirmation rules

**BR-27** `Routine Inspection` requires tenant confirmation (`requiresTenantConfirmation = true`). An appointment only appears in the inspector app at T-1 (the day before inspection) if:
  - `tenantConfirmationStatus = CONFIRMED`, OR
  - `keyRequired = true`, OR
  - Manual confirmation forced by OP/AM

**BR-28** `Ingoing Inspection` and `Outgoing Inspection` do not require tenant confirmation. A SCHEDULED appointment is treated as operationally confirmed and appears in the inspector app at T-1.

**BR-29** Force manual confirmation sets `tenantConfirmationStatus = CONFIRMED` and requires a reason. Only OP, AM, and CL_USER with explicit `force_confirmation` permission can do this.

**BR-30** Tenant portal token expires at 7:00 PM the day before inspection. After expiry the portal is read-only and only OP can change the appointment.

### 5.6 Cancellation rules

**BR-31** Every cancellation requires a reason string (stored as `cancellationReasonCode`).

**BR-32** CL_USER can only cancel if tenant settings have `cancel_appointments: true` for that user's role.

**BR-33** Cancellation has no financial cost. No financial entries are created on cancellation.

**BR-34** Refund/financial adjustment after cancellation of a DONE appointment must go through the financial module separately (DONE → REJECTED → financial adjustment workflow).

### 5.7 Import rules

**BR-35** Import file must be XLSX or CSV format, maximum 10 MB, maximum 1000 rows.

**BR-36** A row is rejected (hard error) if required fields are missing or invalid (see section 3.6 for field requirements by service type).

**BR-37** A row is imported with a warning flag if optional fields are present but malformed, or if geocoding fails.

**BR-38** Deduplication check: if an appointment with the same Street + Address line 2 + Postcode + same ServiceType already exists within the last 3 months for the same tenant, add `WARN_POSSIBLE_DUPLICATE` warning but still import.

**BR-39** Import processing is async via pg-boss. The HTTP response returns immediately with `{ importId, status: 'PENDING' }`.

**BR-40** Each imported row that passes validation creates an Appointment in DRAFT status.

**BR-41** The `OTHER: Key number` column, if present and non-empty, sets `keyRequired = true` and stores the key number in `keyLocationJson`.

**BR-42** Import idempotency: the same `Idempotency-Key` on an import returns the existing `importId` without re-processing.

### 5.8 Multi-tenant rules

**BR-43** Every database query on `appointments` must include a `tenantId` WHERE clause.

**BR-44** AM and OP can query across all tenants. CL_ADMIN and CL_USER are always scoped to their own `tenantId`. INSP is scoped to their own `inspectorId`.

**BR-45** `tenantId` is always extracted from JWT claims. It is never accepted as a user-supplied parameter on mutation endpoints.

**BR-46** No appointment can reference entities (property, branch, inspector) that belong to a different tenant, except for platform-level entities (service types) which are cross-tenant.

### 5.9 Audit rules

**BR-47** Every status transition must generate an audit log entry.

**BR-48** Force manual tenant confirmation must generate an audit log entry with `action = FORCE_MANUAL_CONFIRMATION`.

**BR-49** Every update to appointment fields must generate an audit log entry recording old and new values for changed fields.

**BR-50** Audit logs must include `requestId`, `actorId`, `actorRole`, `tenantId`, `timestamp`.

### 5.10 Service type validation

**BR-51** ServiceType `flowType` values and their semantics:
  - `ROUTINE`: Routine Inspection — requires tenant confirmation
  - `INGOING`: Ingoing Inspection — no tenant confirmation required
  - `OUTGOING`: Outgoing Inspection — no tenant confirmation required
  - `OTHER`: Other service — confirmation requirement from `requiresTenantConfirmation` field

**BR-52** ServiceType is a platform-level catalog (not tenant-scoped). All tenants share the same ServiceType catalog.

### 5.11 Financial rules

**BR-53** Financial entries (TENANT_DEBIT, INSPECTOR_PAYOUT) are created only on the `SCHEDULED → DONE` transition.

**BR-54** `DONE → REJECTED` by AM may trigger financial adjustment. The appointment module emits `appointment.done_rejected.v1` and the financial module decides on refund eligibility.

**BR-55** `DONE → DRAFT` by AM requires reinforced audit and may trigger financial reversal evaluation.

**BR-56** Manual financial adjustments are out of scope for the appointment module. They belong to the financial module.

---

## 6. Authorization Matrix

### 6.1 Endpoint authorization

| Endpoint | AM | OP | CL_ADMIN | CL_USER | INSP | TNT |
|---|---|---|---|---|---|---|
| POST /v1/appointments | Yes | Yes | Yes | With permission | No | No |
| GET /v1/appointments | Yes (all tenants) | Yes (all tenants) | Yes (own tenant) | Yes (own tenant) | No | No |
| GET /v1/appointments/:id | Yes | Yes | Yes | Yes | Own only | No |
| PATCH /v1/appointments/:id | Yes | Yes | Yes | With permission | No | No |
| POST .../status-transitions | Varies | Varies | Varies | Varies | Varies | No |
| POST .../import | Yes | Yes | Yes | No | No | No |
| GET .../import/:id | Yes | Yes | Yes (own) | No | No | No |
| POST .../force-confirmation | Yes | Yes | No | With permission | No | No |

### 6.2 Status transition authorization matrix

| Transition | AM | OP | CL_ADMIN | CL_USER | INSP | SYS |
|---|---|---|---|---|---|---|
| DRAFT → AWAITING_INSPECTOR | Yes | Yes | No | No | No | Yes |
| DRAFT → REJECTED | Yes | Yes | No | No | No | No |
| DRAFT → CANCELLED | Yes | Yes | Yes | With permission | No | No |
| AWAITING_INSPECTOR → SCHEDULED | Yes | Yes | No | No | No | Yes |
| AWAITING_INSPECTOR → CANCELLED | Yes | Yes | Yes | With permission | No | No |
| AWAITING_INSPECTOR → REJECTED | Yes | Yes | No | No | No | No |
| SCHEDULED → DONE | Yes | Yes | No | No | Yes | No |
| SCHEDULED → CANCELLED | Yes | Yes | Yes | With permission | No | No |
| SCHEDULED → REJECTED | Yes | Yes | No | No | No | Yes |
| REJECTED → DRAFT | Yes | Yes | No | No | No | No |
| REJECTED → AWAITING_INSPECTOR | Yes | Yes | No | No | No | No |
| CANCELLED → DRAFT | Yes | Yes | No | No | No | No |
| DONE → DRAFT | Yes | No | No | No | No | No |
| DONE → REJECTED | Yes | No | No | No | No | No |

**Notes:**
- "With permission" for CL_USER means the tenant's settings must explicitly grant that permission.
- CL_USER permissions configurable per tenant: `create_appointments`, `cancel_appointments`, `reschedule_appointments`, `force_confirmation`, `export_reports`.
- INSP for DONE transition: only allowed if `inspectorId` on the appointment matches the actor's inspector ID.

### 6.3 CL_USER configurable permissions

| Permission key | Affects |
|---|---|
| `create_appointments` | POST /v1/appointments |
| `cancel_appointments` | CANCELLED transitions from DRAFT, AWAITING_INSPECTOR, SCHEDULED |
| `reschedule_appointments` | updateAppointment when changing scheduledDate/timeSlot |
| `force_confirmation` | POST .../force-confirmation |
| `export_reports` | Report generation endpoints |

---

## 7. Domain Events

All events are published to the internal event bus (pg-boss queue `events`) with format:

```typescript
interface DomainEvent<T> {
  eventName: string;           // e.g. "appointment.created.v1"
  eventId: string;             // UUID, unique per event
  version: string;             // "v1"
  occurredAt: string;          // ISO timestamp
  requestId: string;
  tenantId: string;
  payload: T;
}
```

### 7.1 appointment.created.v1

Emitted when: appointment successfully created.

```typescript
interface AppointmentCreatedPayload {
  appointmentId: string;
  tenantId: string;
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  status: 'DRAFT';
  scheduledDate: string;
  timeSlot: string;
  createdByUserId: string;
}
```

### 7.2 appointment.released.v1

Emitted when: `DRAFT → AWAITING_INSPECTOR` or `REJECTED → AWAITING_INSPECTOR`.

```typescript
interface AppointmentReleasedPayload {
  appointmentId: string;
  tenantId: string;
  serviceTypeId: string;
  scheduledDate: string;
  timeSlot: string;
  branchId: string;
  actorId: string;
  actorRole: string;
}
```

### 7.3 appointment.scheduled.v1

Emitted when: `AWAITING_INSPECTOR → SCHEDULED`.

```typescript
interface AppointmentScheduledPayload {
  appointmentId: string;
  tenantId: string;
  inspectorId: string;
  scheduledDate: string;
  timeSlot: string;
  propertyId: string;
  serviceTypeId: string;
  actorId: string;
  actorRole: string;
  tenantConfirmationStatus: string;
}
```

### 7.4 appointment.done.v1

Emitted when: `SCHEDULED → DONE`.

```typescript
interface AppointmentDonePayload {
  appointmentId: string;
  tenantId: string;
  inspectorId: string;
  doneCheckedByUserId: string;
  doneCheckedAt: string;
  priceAmount: string;
  payoutAmount: string;
  scheduledDate: string;
  actorId: string;
  actorRole: string;
}
```

**Consumers:**
- `financial` module: creates TENANT_DEBIT and INSPECTOR_PAYOUT entries
- `notification` module: sends completion notifications

### 7.5 appointment.cancelled.v1

Emitted when: any `→ CANCELLED` transition.

```typescript
interface AppointmentCancelledPayload {
  appointmentId: string;
  tenantId: string;
  previousStatus: string;
  cancellationReasonCode: string;
  actorId: string;
  actorRole: string;
  inspectorId: string | null;
}
```

**Consumers:**
- `notification` module: sends cancellation notification to tenant and inspector (if SCHEDULED)

### 7.6 appointment.rejected.v1

Emitted when: any `→ REJECTED` transition (except DONE → REJECTED).

```typescript
interface AppointmentRejectedPayload {
  appointmentId: string;
  tenantId: string;
  previousStatus: string;
  rejectionReasonCode: string;
  actorId: string;
  actorRole: string;
}
```

### 7.7 appointment.reopened.v1

Emitted when: `REJECTED → DRAFT`, `CANCELLED → DRAFT`.

```typescript
interface AppointmentReopenedPayload {
  appointmentId: string;
  tenantId: string;
  previousStatus: string;
  reason: string;
  actorId: string;
  actorRole: string;
}
```

### 7.8 appointment.done_reopened.v1

Emitted when: `DONE → DRAFT` (AM only, reinforced audit).

```typescript
interface AppointmentDoneReopenedPayload {
  appointmentId: string;
  tenantId: string;
  reason: string;
  actorId: string;     // must be AM
  priceAmount: string;
  payoutAmount: string;
}
```

**Consumers:**
- `financial` module: evaluate financial reversal

### 7.9 appointment.done_rejected.v1

Emitted when: `DONE → REJECTED` (AM only).

```typescript
interface AppointmentDoneRejectedPayload {
  appointmentId: string;
  tenantId: string;
  reason: string;
  actorId: string;     // must be AM
  priceAmount: string;
  payoutAmount: string;
}
```

**Consumers:**
- `financial` module: evaluate refund/adjustment

### 7.10 appointment.confirmation.forced.v1

Emitted when: force manual tenant confirmation.

```typescript
interface AppointmentConfirmationForcedPayload {
  appointmentId: string;
  tenantId: string;
  previousConfirmationStatus: string;
  confirmedByUserId: string;
  reason: string;
  actorId: string;
  actorRole: string;
}
```

---

## 8. Queue Jobs

### 8.1 appointment.import

**Queue name:** `appointment.import`
**Worker file:** `src/modules/appointment/infrastructure/jobs/appointment-import.worker.ts`

#### Job payload

```typescript
interface AppointmentImportJobData {
  importId: string;
  tenantId: string;
  branchId: string;
  actorId: string;
  requestId: string;
}
```

#### Job options (pg-boss)

```typescript
await boss.send('appointment.import', payload, {
  retryLimit: 2,      // 3 total attempts
  retryBackoff: true, // exponential backoff
});
// Jobs are retained after completion (pg-boss default behavior keeps records)
```

#### Worker registration

```typescript
await boss.work('appointment.import', async (job) => { /* worker logic */ });
```

#### Worker processing steps

1. Load `AppointmentImport` record by `importId`. Verify `status = PENDING`.
2. Set `status = PROCESSING`.
3. Download file from Supabase Storage using `fileKey`.
4. Parse XLSX/CSV into row objects.
5. For each row (in order):
   a. Validate row fields per hard error rules (see BR-36).
   b. If hard error: record `{ row, status: 'REJECTED', errors: [{ code, message, field }] }` in `resultJson`. Increment `errorCount`. Continue to next row.
   c. Resolve ServiceType by `Service` column value (match by code or name, case-insensitive).
   d. Check deduplication: query `appointments` for same `street + addressLine2 + postcode + serviceTypeId` within last 3 months for `tenantId`.
   e. If duplicate found: add `WARN_POSSIBLE_DUPLICATE` to warnings list.
   f. Validate optional fields (phone, email). Add appropriate warnings.
   g. Find or create Property (upsert by `propertyCode` if provided, else by address).
   h. Resolve `ServicePriceRule` for `(tenantId, serviceTypeId, branchId)`.
   i. Compute `payoutAmount`.
   j. Create `Appointment` in DRAFT.
   k. Create `AppointmentContact` if tenant data present.
   l. Create `AppointmentRestriction` with `source = IMPORT` if restrictions present.
   m. Record `{ row, status: warnings.length > 0 ? 'WARNING' : 'ACCEPTED', appointmentId, warnings }` in `resultJson`. Increment `acceptedCount` (or `warningCount` if warnings present).
6. Update `AppointmentImport` record:
   - `status = COMPLETED` (or `FAILED` if exception)
   - `totalRows`, `acceptedCount`, `warningCount`, `errorCount`
   - `resultJson` with full per-row results
7. Emit `appointment.import.completed.v1` event.

#### Failure handling

- On unrecoverable error (corrupt file, storage unreachable): set `status = FAILED`, `errorMessage`, emit `appointment.import.failed.v1`.
- pg-boss retry up to 3 times with exponential backoff.
- After all retries exhausted: job state becomes `failed` in `pgboss.job` table (DLQ equivalent — `appointment.import.dlq` queue name).

### 8.2 appointment.notify (side effect job)

**Queue name:** `appointment.notify`

Enqueued after status transitions that require notifications.

#### Job payload

```typescript
interface AppointmentNotifyJobData {
  eventName: string;             // e.g. "appointment.scheduled.v1"
  appointmentId: string;
  tenantId: string;
  templateCode: string;
  recipients: {
    type: 'TENANT' | 'INSPECTOR' | 'PROPERTY_MANAGER';
    channel: 'EMAIL' | 'SMS';
    address: string;
  }[];
  variables: Record<string, string>;
  requestId: string;
}
```

Enqueued by the appointment use case on:
- `AWAITING_INSPECTOR → SCHEDULED`: confirmation email to tenant (Routine), confirmation to inspector
- `* → CANCELLED`: cancellation email to tenant
- `SCHEDULED → DONE`: completion notification

### 8.3 appointment.financial (side effect job)

**Queue name:** `appointment.financial`

Enqueued by `executeStatusTransition` on `SCHEDULED → DONE`.

#### Job payload

```typescript
interface AppointmentFinancialJobData {
  appointmentId: string;
  tenantId: string;
  inspectorId: string;
  doneCheckedByUserId: string;
  priceAmount: string;
  payoutAmount: string;
  requestId: string;
}
```

The financial module's worker consumes this and creates `FinancialEntry` records with idempotency on `appointmentId`.

---

## 9. Test Scenarios

### 9.1 Unit tests

#### AppointmentStateMachineService

```typescript
describe('AppointmentStateMachineService', () => {
  describe('validateTransition', () => {
    it('should allow DRAFT → AWAITING_INSPECTOR for OP actor');
    it('should allow DRAFT → AWAITING_INSPECTOR for SYS actor');
    it('should deny DRAFT → AWAITING_INSPECTOR for CL_ADMIN actor');
    it('should deny DRAFT → AWAITING_INSPECTOR for INSP actor');
    it('should allow DRAFT → CANCELLED for CL_ADMIN');
    it('should allow DRAFT → CANCELLED for AM');
    it('should deny DRAFT → CANCELLED for INSP');
    it('should require reason for DRAFT → CANCELLED');
    it('should not require reason for DRAFT → AWAITING_INSPECTOR');
    it('should require reason for SCHEDULED → REJECTED');
    it('should require reason for DONE → DRAFT');
    it('should allow DONE → DRAFT only for AM');
    it('should deny DONE → DRAFT for OP');
    it('should deny DONE → DRAFT for CL_ADMIN');
    it('should allow DONE → REJECTED only for AM');
    it('should deny SCHEDULED → DONE for CL_ADMIN');
    it('should allow SCHEDULED → DONE for INSP');
    it('should throw APPOINTMENT_INVALID_TRANSITION for DONE → SCHEDULED (undefined transition)');
    it('should throw APPOINTMENT_INVALID_TRANSITION for DONE → AWAITING_INSPECTOR (undefined transition)');
    it('all 14 defined transitions should pass validation with valid actors');
  });
});
```

#### AppointmentPricingService

```typescript
describe('AppointmentPricingService', () => {
  describe('computePayoutAmount', () => {
    it('should return payoutValue directly when payoutType is FIXED');
    it('should compute percentage payout correctly (50% of 150 = 75.00)');
    it('should round to 2 decimal places');
    it('should prefer branch-specific rule over tenant-wide rule');
    it('should fall back to tenant-wide rule when no branch rule exists');
    it('should throw APPOINTMENT_NO_PRICE_RULE when no rule found');
  });
  describe('snapshotPricingRule', () => {
    it('should include snapshotAt timestamp');
    it('should include all rule fields in snapshot');
  });
});
```

#### CreateAppointmentUseCase

```typescript
describe('CreateAppointmentUseCase', () => {
  it('should create appointment in DRAFT status');
  it('should snapshot pricing at creation time');
  it('should create AppointmentContact when contact is provided');
  it('should create AppointmentRestriction with source OPERATOR when restriction is provided');
  it('should fail when propertyId not found');
  it('should fail when property belongs to different tenant');
  it('should fail when branch belongs to different tenant');
  it('should fail when serviceType is INACTIVE');
  it('should fail when no active price rule exists');
  it('should create inline property when property object provided');
  it('should fail when both propertyId and property are provided');
  it('should fail when neither propertyId nor property is provided');
  it('should emit appointment.created.v1 event on success');
  it('should write audit log on creation');
});
```

#### ExecuteStatusTransitionUseCase

```typescript
describe('ExecuteStatusTransitionUseCase', () => {
  describe('idempotency', () => {
    it('should return cached response for same idempotency key and same payload');
    it('should return 409 for same idempotency key with different payload');
    it('should return 400 when idempotency key is missing');
  });
  describe('SCHEDULED → DONE', () => {
    it('should require doneCheckedByUserId');
    it('should fail if doneCheckedByUserId has role CL_ADMIN');
    it('should fail if doneCheckedByUserId same as inspectorId');
    it('should emit appointment.done.v1 on success');
    it('should enqueue appointment.financial job on success');
    it('should set doneCheckedByUserId and doneCheckedAt');
  });
  describe('AWAITING_INSPECTOR → SCHEDULED', () => {
    it('should require inspectorId for manual assignment');
    it('should set inspectorId on appointment');
    it('should emit appointment.scheduled.v1');
  });
  describe('DONE → DRAFT (AM only)', () => {
    it('should succeed for AM');
    it('should fail for OP');
    it('should emit appointment.done_reopened.v1');
  });
  describe('transitions requiring reason', () => {
    it('should fail DRAFT → CANCELLED without reason');
    it('should fail SCHEDULED → REJECTED without reason');
    it('should pass with valid reason string');
  });
  describe('multi-tenant', () => {
    it('should reject transition for appointment belonging to different tenant');
  });
});
```

#### UpdateAppointmentUseCase

```typescript
describe('UpdateAppointmentUseCase', () => {
  it('should update fields when status is DRAFT');
  it('should update fields when status is AWAITING_INSPECTOR');
  it('should reject update when status is SCHEDULED');
  it('should reject update when status is DONE');
  it('should reject rescheduling past 7PM cutoff for CL_ADMIN');
  it('should allow rescheduling past 7PM cutoff for OP');
  it('should reject new scheduledDate beyond 30 days from original');
  it('should upsert contact when contact is provided');
  it('should upsert restriction with source OPERATOR');
  it('should write audit log with changed fields');
});
```

#### ImportAppointmentsUseCase

```typescript
describe('ImportAppointmentsUseCase (synchronous phase)', () => {
  it('should return 400 when idempotency key missing');
  it('should reject non-XLSX/CSV files');
  it('should reject files > 10 MB');
  it('should reject when required columns are missing');
  it('should reject when row count > 1000');
  it('should return importId with PENDING status');
  it('should enqueue appointment.import pg-boss job');
  it('should return cached importId for same idempotency key');
});
```

#### AppointmentImportWorker (async phase)

```typescript
describe('AppointmentImportWorker', () => {
  it('should process all rows and create appointments for valid rows');
  it('should reject row when Service column is invalid');
  it('should reject row when Street is empty');
  it('should reject row when Postcode is invalid');
  it('should add WARN_POSSIBLE_DUPLICATE when deduplication match found');
  it('should add WARN_TENANT_PHONE_INVALID when phone format bad');
  it('should set keyRequired=true when OTHER: Key number column present');
  it('should create AppointmentContact for Routine with tenant data');
  it('should not require tenant data for Ingoing service type');
  it('should set import status to COMPLETED on success');
  it('should set import status to FAILED on unrecoverable error');
  it('should update acceptedCount, warningCount, errorCount correctly');
});
```

#### ForceManualTenantConfirmationUseCase

```typescript
describe('ForceManualTenantConfirmationUseCase', () => {
  it('should set tenantConfirmationStatus to CONFIRMED');
  it('should require reason');
  it('should fail when appointment is not SCHEDULED');
  it('should fail when actor is CL_ADMIN without permission');
  it('should succeed for OP');
  it('should succeed for AM');
  it('should write audit log with action FORCE_MANUAL_CONFIRMATION');
  it('should emit appointment.confirmation.forced.v1');
});
```

### 9.2 Integration tests (Supertest + test database)

#### POST /v1/appointments

```typescript
describe('POST /v1/appointments', () => {
  it('201: creates appointment as OP actor with propertyId');
  it('201: creates appointment as CL_ADMIN with inline property');
  it('201: creates appointment as CL_USER with create_appointments permission');
  it('403: CL_USER without create_appointments permission');
  it('401: unauthenticated request');
  it('422: missing branchId');
  it('422: missing serviceTypeId');
  it('422: missing scheduledDate');
  it('422: invalid timeSlot format');
  it('404: propertyId not found');
  it('422: no active price rule');
  it('403: branchId belongs to different tenant (CL_ADMIN)');
  it('returns correct priceAmount and payoutAmount from pricing rule');
  it('returns pricingRuleSnapshotJson with snapshotAt field');
});
```

#### GET /v1/appointments

```typescript
describe('GET /v1/appointments', () => {
  it('200: AM sees appointments across all tenants');
  it('200: OP sees appointments across all tenants');
  it('200: CL_ADMIN sees only own tenant appointments');
  it('200: CL_USER sees only own tenant appointments');
  it('200: filters by status');
  it('200: filters by branchId');
  it('200: filters by fromDate and toDate');
  it('200: filters by tenantConfirmationStatus');
  it('200: search by tenant name in contact');
  it('200: search by property address');
  it('200: paginated response with correct meta');
  it('401: unauthenticated request');
  it('INSP: cannot access this endpoint');
});
```

#### POST /v1/appointments/:id/status-transitions

```typescript
describe('POST /v1/appointments/:id/status-transitions', () => {
  it('200: DRAFT → AWAITING_INSPECTOR by OP');
  it('200: DRAFT → CANCELLED by CL_ADMIN with reason');
  it('200: DRAFT → CANCELLED by CL_USER with cancel permission');
  it('200: AWAITING_INSPECTOR → SCHEDULED by OP with inspectorId');
  it('200: SCHEDULED → DONE by INSP with doneCheckedByUserId (OP)');
  it('200: SCHEDULED → DONE by OP with doneCheckedByUserId (AM)');
  it('200: DONE → DRAFT by AM with reason');
  it('400: missing Idempotency-Key header');
  it('409: same key, different payload');
  it('200: same key, same payload → idempotent (same response)');
  it('422: DONE → SCHEDULED (invalid transition)');
  it('403: CL_ADMIN → DRAFT → REJECTED (not permitted)');
  it('422: DRAFT → CANCELLED without reason');
  it('422: SCHEDULED → DONE without doneCheckedByUserId');
  it('422: SCHEDULED → DONE with doneCheckedByUserId having role CL_ADMIN');
  it('403: INSP attempting DRAFT → AWAITING_INSPECTOR');
  it('403: DONE → DRAFT by OP (AM only)');
  it('403: tenant mismatch (CL_ADMIN on another tenant appointment)');
  it('persists audit log after transition');
  it('emits correct domain event');
});
```

#### POST /v1/appointments/import

```typescript
describe('POST /v1/appointments/import', () => {
  it('202: valid XLSX file enqueues job and returns importId');
  it('202: valid CSV file enqueues job and returns importId');
  it('400: missing Idempotency-Key');
  it('422: .txt file rejected');
  it('422: file > 10 MB rejected');
  it('422: missing required column "Service"');
  it('422: row count > 1000 rejected');
  it('403: CL_USER not allowed to import');
  it('200 idempotent: same key returns same importId');
});
```

#### GET /v1/appointments/import/:importId

```typescript
describe('GET /v1/appointments/import/:importId', () => {
  it('200: returns PENDING status before job runs');
  it('200: returns COMPLETED status after job runs with row results');
  it('200: returns FAILED status when job failed');
  it('404: importId not found');
  it('403: CL_ADMIN cannot access import from different tenant');
});
```

### 9.3 Edge cases

**State machine edge cases:**

```typescript
it('DONE → DRAFT should clear rejectionReasonCode if previously set');
it('REJECTED → AWAITING_INSPECTOR should clear rejectionReasonCode');
it('CANCELLED → DRAFT should clear cancellationReasonCode');
it('concurrent transition requests with same idempotency key should resolve consistently');
it('concurrent transition requests with different keys on same appointment should serialize correctly');
it('SYS actor transitions should record system event in audit log');
```

**Pricing edge cases:**

```typescript
it('payout 100% of price should equal priceAmount');
it('payout 0% should result in 0.00 payoutAmount');
it('FIXED payout type ignores priceAmount');
it('branch-specific price rule overrides tenant-wide rule');
it('price rule becomes inactive after appointment creation; priceAmount should remain snapshotted');
```

**Import edge cases:**

```typescript
it('import with all rows having errors sets errorCount correctly and no appointments created');
it('import with mixed valid/warning/error rows sets all counts correctly');
it('duplicate import (same file, same idempotency key) does not re-process');
it('import detects duplicate from existing appointment within 3-month window');
it('import detects duplicate only within same tenant');
it('import with OTHER: Key number column sets keyRequired=true');
it('import XLSX with empty trailing rows ignores them');
it('import Ingoing service type: tenant fields are optional, appointment created without contact');
it('import Routine service type: missing tenant email rejects row');
```

**Rescheduling edge cases:**

```typescript
it('update after 7PM day before: CL_ADMIN gets APPOINTMENT_RESCHEDULE_WINDOW_EXPIRED');
it('update after 7PM day before: OP succeeds');
it('update to date 31 days ahead: rejected with APPOINTMENT_RESCHEDULE_MAX_DATE_EXCEEDED');
it('update to date 30 days ahead: accepted');
it('INSP cannot call updateAppointment endpoint');
```

**T-1 visibility edge cases:**

```typescript
it('Routine appointment with tenantConfirmationStatus=PENDING and keyRequired=false: not visible at T-1');
it('Routine appointment with tenantConfirmationStatus=CONFIRMED: visible at T-1');
it('Routine appointment with keyRequired=true: visible at T-1 regardless of confirmation');
it('Ingoing appointment SCHEDULED: visible at T-1 without tenant confirmation');
it('Outgoing appointment SCHEDULED: visible at T-1 without tenant confirmation');
```

### 9.4 Security and multi-tenant tests

```typescript
describe('Multi-tenant isolation', () => {
  it('CL_ADMIN cannot read appointment from different tenant (expect 403 or 404)');
  it('CL_ADMIN cannot update appointment from different tenant');
  it('CL_ADMIN cannot perform status transition on appointment from different tenant');
  it('CL_ADMIN cannot access import from different tenant');
  it('INSP cannot read appointment not assigned to them');
  it('INSP cannot perform status transitions on unassigned appointment');
  it('AM can read any appointment across tenants');
  it('OP can read any appointment across tenants');
  it('tenant_id cannot be overridden via request body');
  it('tenantId filter in listAppointments is ignored for CL actors (uses own tenantId)');
});

describe('JWT claims enforcement', () => {
  it('request without Bearer token returns 401');
  it('request with expired JWT returns 401');
  it('request with invalid JWT signature returns 401');
  it('request with tampered tenantId claim returns 403 or 401');
});

describe('RBAC enforcement', () => {
  it('CL_USER without create_appointments permission gets 403 on POST /v1/appointments');
  it('CL_USER without cancel_appointments permission gets 403 on cancellation transition');
  it('CL_USER with cancel_appointments permission can cancel own tenant appointment');
  it('INSP cannot access list endpoint (403)');
  it('INSP can get own assigned appointment (200)');
  it('INSP cannot get unassigned appointment (403/404)');
});

describe('Idempotency security', () => {
  it('idempotency keys are scoped per tenant; same key from different tenant is treated as new');
  it('idempotency key with different payload returns 409');
  it('using another tenant idempotency key does not leak response data');
});
```

### 9.5 Financial integration tests

```typescript
describe('Financial entries on DONE transition', () => {
  it('creates TENANT_DEBIT entry with priceAmount');
  it('creates INSPECTOR_PAYOUT entry with payoutAmount');
  it('TENANT_DEBIT references correct tenantId');
  it('INSPECTOR_PAYOUT references correct inspectorId');
  it('financial entries are idempotent: re-processing DONE event does not double-create entries');
  it('DONE → DRAFT emits done_reopened event consumed by financial module');
  it('DONE → REJECTED emits done_rejected event consumed by financial module');
});
```

### 9.6 Notification integration tests

```typescript
describe('Notifications on status transitions', () => {
  it('AWAITING_INSPECTOR → SCHEDULED enqueues confirmation email job for Routine service type');
  it('AWAITING_INSPECTOR → SCHEDULED enqueues inspector notification job');
  it('SCHEDULED → CANCELLED enqueues cancellation email job');
  it('SCHEDULED → DONE enqueues completion notification job');
});
```

---

## Appendix A: Rejection reason codes

Predefined codes for `rejectionReasonCode` on `SCHEDULED → REJECTED`:

| Code | Description |
|---|---|
| `TENANT_UNRESPONSIVE` | Tenant did not respond after full communication flow |
| `TENANT_UNAVAILABLE` | Tenant reported unavailability |
| `TENANT_DECLINED` | Tenant declined the inspection |
| `OPERATIONAL_INFEASIBILITY` | Operational infeasibility identified |
| `INVALID_SERVICE_DATA` | Service data is invalid or incomplete |

## Appendix B: Cancellation reason codes

Predefined codes for `cancellationReasonCode`:

| Code | Description |
|---|---|
| `CLIENT_REQUEST` | Client requested cancellation |
| `TENANT_REQUEST` | Tenant requested cancellation |
| `PROPERTY_UNAVAILABLE` | Property unavailable |
| `DUPLICATE` | Duplicate appointment |
| `OTHER` | Other reason (free text in reason field) |

## Appendix C: Import template column mapping

| Spreadsheet column | DTO field | Notes |
|---|---|---|
| Service | serviceType | Match by ServiceType.code or name (case-insensitive) |
| Property code | property.propertyCode | Optional |
| Date | scheduledDate | Parse DD/MM/YYYY or YYYY-MM-DD |
| Hour | scheduledDate time part | Combined with Date for scheduledDate |
| Time Slot | timeSlot | Normalize to HH:MM-HH:MM format |
| Street | property.street | Required |
| Suburb | property.suburb | Required |
| Postcode | property.postcode | Required |
| State | property.state | Required |
| Country | property.country | Default: Australia |
| Address line 2 | property.addressLine2 | Optional |
| Notes | notes | Optional |
| Realty description | customFieldsJson.realtyDescription | Optional |
| Tenant name | contact.tenantName | Required for Routine |
| Tenant mail | contact.primaryEmail | Required for Routine |
| Tenant phone | contact.primaryPhone | Required for Routine |
| PHONE: Tenant secondary phone | contact.secondaryPhone | Optional |
| EMAIL: Tenant secondary mail | contact.secondaryEmail | Optional |
| OTHER: Key number | keyLocationJson.keyNumber + keyRequired=true | Optional |

## Appendix D: Time zone handling

- All `scheduledDate` values are stored as UTC dates in the database.
- The 7:00 PM rescheduling cutoff is evaluated in the tenant's configured timezone (`tenants.timezone`, e.g., `Australia/Sydney`).
- API inputs for `scheduledDate` are YYYY-MM-DD strings (date only).
- `createdAt`, `updatedAt`, `doneCheckedAt` are UTC timestamps.
- When computing T-1 visibility, compare current date in tenant timezone against `scheduledDate`.
