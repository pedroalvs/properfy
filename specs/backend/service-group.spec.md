# Service Group & Marketplace — Implementation Spec

> **SUPERSEDED** by `specs/005-service-groups-marketplace/` — this legacy spec is preserved for historical reference only.

**Module:** `src/modules/service-group/`
**Version:** 1.0
**Status:** Ready for implementation
**Last updated:** 2026-03-15

This document is self-contained. A developer can implement the entire Service Group and Marketplace module from this spec alone without consulting any other documentation.

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
9. [External Integrations](#9-external-integrations)
10. [Test Scenarios](#10-test-scenarios)

---

## 1. Overview

The Service Group module orchestrates the grouping of individual `AWAITING_INSPECTOR` appointments into batches (service groups) that are offered to inspectors via a marketplace. Inspectors accept groups, triggering the transition of all member appointments from `AWAITING_INSPECTOR` to `SCHEDULED`.

**Key responsibilities:**

- Create and manage service groups from eligible appointments
- Publish groups to the marketplace (visible to eligible inspectors)
- Support manual direct assignment of inspectors (bypassing marketplace)
- Handle concurrent acceptance with first-valid-wins race resolution
- Track inspector availability slots for eligibility filtering
- Enforce minimum/maximum group size constraints
- Support 24h priority mode for urgent groups

**Module boundaries:**

- This module is the authoritative owner of `service_groups` and `inspector_availability_slots` tables.
- Appointment status transitions triggered by this module are delegated to the `appointment` domain (via application-layer commands), not executed directly.
- Financial effects are triggered by the `appointment` domain on `DONE`, not by this module.

**Clean Architecture layers:**

```
src/modules/service-group/
├── domain/
│   ├── entities/ServiceGroup.ts
│   ├── entities/InspectorAvailabilitySlot.ts
│   ├── value-objects/TimeWindow.ts
│   ├── enums/ServiceGroupStatus.ts
│   ├── enums/PriorityMode.ts
│   └── ports/IServiceGroupRepository.ts
├── application/
│   ├── use-cases/CreateServiceGroupUseCase.ts
│   ├── use-cases/PublishServiceGroupUseCase.ts
│   ├── use-cases/AssignInspectorManuallyUseCase.ts
│   ├── use-cases/AcceptOfferUseCase.ts
│   ├── use-cases/ListServiceGroupsUseCase.ts
│   ├── use-cases/GetMarketplaceOffersUseCase.ts
│   ├── use-cases/GetServiceGroupUseCase.ts
│   └── dtos/
├── infrastructure/
│   ├── repositories/PrismaServiceGroupRepository.ts
│   └── repositories/PrismaInspectorAvailabilitySlotRepository.ts
└── interfaces/
    ├── http/routes/service-group.routes.ts
    ├── http/routes/marketplace.routes.ts
    └── http/schemas/
```

---

## 2. Data Model

### 2.1 Prisma Schema

```prisma
// ─── Enums ───────────────────────────────────────────────────────────────────

enum ServiceGroupStatus {
  DRAFT
  PUBLISHED
  ACCEPTED
  CANCELLED
}

enum PriorityMode {
  STANDARD
  PRIORITY_24H
}

enum AvailabilitySlotStatus {
  ACTIVE
  INACTIVE
}

// ─── ServiceGroup ─────────────────────────────────────────────────────────────

model ServiceGroup {
  id                   String             @id @default(cuid())
  tenant_id            String
  service_type_id      String
  status               ServiceGroupStatus @default(DRAFT)
  group_size           Int                // total appointments in group (5–25)
  offered_count        Int                @default(0) // times pushed to marketplace
  confirmed_count      Int                @default(0) // accepted inspections count
  scheduled_date       DateTime           @db.Date
  time_window          String             // e.g. "08:00-12:00"
  priority_mode        PriorityMode       @default(STANDARD)
  priority_expires_at  DateTime?
  assigned_inspector_id String?
  created_by_user_id   String
  created_at           DateTime           @default(now())
  updated_at           DateTime           @updatedAt

  // Relations
  tenant               Tenant             @relation(fields: [tenant_id], references: [id])
  service_type         ServiceType        @relation(fields: [service_type_id], references: [id])
  assigned_inspector   Inspector?         @relation(fields: [assigned_inspector_id], references: [id])
  created_by           User               @relation(fields: [created_by_user_id], references: [id])
  appointments         Appointment[]

  @@index([tenant_id])
  @@index([status])
  @@index([scheduled_date])
  @@index([assigned_inspector_id])
  @@map("service_groups")
}

// ─── InspectorAvailabilitySlot ────────────────────────────────────────────────

model InspectorAvailabilitySlot {
  id           String                @id @default(cuid())
  inspector_id String
  date         DateTime              @db.Date
  start_time   String                // HH:mm 24-hour format
  end_time     String                // HH:mm 24-hour format
  region_json  Json                  // GeoJSON polygon or array of suburb strings
  capacity     Int                   @default(1)
  status       AvailabilitySlotStatus @default(ACTIVE)
  created_at   DateTime              @default(now())
  updated_at   DateTime              @updatedAt

  inspector    Inspector             @relation(fields: [inspector_id], references: [id])

  @@index([inspector_id])
  @@index([date])
  @@index([status])
  @@map("inspector_availability_slots")
}
```

### 2.2 TypeScript Domain Entities

```typescript
// domain/entities/ServiceGroup.ts
export interface ServiceGroupEntity {
  id: string;
  tenantId: string;
  serviceTypeId: string;
  status: ServiceGroupStatus;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: Date;
  timeWindow: string;
  priorityMode: PriorityMode;
  priorityExpiresAt: Date | null;
  assignedInspectorId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

// domain/entities/InspectorAvailabilitySlot.ts
export interface InspectorAvailabilitySlotEntity {
  id: string;
  inspectorId: string;
  date: Date;
  startTime: string;
  endTime: string;
  regionJson: unknown; // GeoJSON or suburb array
  capacity: number;
  status: AvailabilitySlotStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.3 Database Indexes (migration notes)

```sql
-- Performance indexes beyond Prisma defaults
CREATE INDEX idx_service_groups_tenant_status ON service_groups(tenant_id, status);
CREATE INDEX idx_service_groups_scheduled_date_status ON service_groups(scheduled_date, status);
CREATE INDEX idx_availability_slots_inspector_date ON inspector_availability_slots(inspector_id, date, status);
```

---

## 3. Use Cases

### 3.1 CreateServiceGroup

**Name:** `CreateServiceGroupUseCase`
**Actor:** OP
**File:** `application/use-cases/CreateServiceGroupUseCase.ts`

**Preconditions:**
- Actor has role `OP`
- All `appointmentIds` belong to the same `tenant_id` as the actor's context
- All appointments are in status `AWAITING_INSPECTOR`
- All appointments share the same `service_type_id` as the provided `serviceTypeId`
- No appointment is already assigned to another service group (`service_group_id IS NULL`)
- `appointmentIds.length` is between 5 and 25 (inclusive), with exceptions documented in BR-01

**Input DTO:**

```typescript
interface CreateServiceGroupInput {
  appointmentIds: string[];     // 5–25 items
  serviceTypeId: string;
  scheduledDate: string;        // ISO date "YYYY-MM-DD"
  timeWindow: string;           // "HH:mm-HH:mm" e.g. "08:00-12:00"
  priorityMode: PriorityMode;   // STANDARD | PRIORITY_24H
  requestId: string;
}
```

**Process:**
1. Load all appointments by IDs, asserting `tenant_id` matches auth context.
2. Assert all appointments have `status = AWAITING_INSPECTOR`.
3. Assert all appointments have `service_type_id = serviceTypeId`.
4. Assert no appointment has a non-null `service_group_id`.
5. Assert `appointmentIds.length >= 5` and `<= 25`.
6. If `priorityMode = PRIORITY_24H`, compute `priorityExpiresAt = scheduledDate - 24h`. Validate that the group's `scheduled_date` is at least 24h from now.
7. Create `ServiceGroup` record with `status = DRAFT`.
8. Update all appointments: set `service_group_id = newGroup.id`.
9. Write audit log: `action = SERVICE_GROUP_CREATED`.
10. Emit domain event `service_group.created.v1`.

**Output:**

```typescript
interface CreateServiceGroupOutput {
  id: string;
  tenantId: string;
  serviceTypeId: string;
  status: 'DRAFT';
  groupSize: number;
  scheduledDate: string;
  timeWindow: string;
  priorityMode: PriorityMode;
  priorityExpiresAt: string | null;
  createdAt: string;
}
```

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `APPOINTMENT_NOT_FOUND` | 404 | Any appointmentId not found in tenant scope |
| `APPOINTMENT_INVALID_STATUS` | 422 | Any appointment is not `AWAITING_INSPECTOR` |
| `APPOINTMENT_ALREADY_IN_GROUP` | 422 | Any appointment already has `service_group_id` |
| `SERVICE_TYPE_MISMATCH` | 422 | Appointments have differing `service_type_id` |
| `GROUP_SIZE_TOO_SMALL` | 422 | `appointmentIds.length < 5` |
| `GROUP_SIZE_TOO_LARGE` | 422 | `appointmentIds.length > 25` |
| `INVALID_TIME_WINDOW_FORMAT` | 422 | `timeWindow` does not match `HH:mm-HH:mm` |
| `PRIORITY_DATE_TOO_CLOSE` | 422 | `PRIORITY_24H` but `scheduledDate < now + 24h` |

**Side effects:**
- All member appointments have `service_group_id` set.
- Audit log entry created.
- Domain event emitted.

---

### 3.2 PublishServiceGroup

**Name:** `PublishServiceGroupUseCase`
**Actor:** OP
**File:** `application/use-cases/PublishServiceGroupUseCase.ts`

**Preconditions:**
- Actor has role `OP`
- `ServiceGroup.status = DRAFT`
- `ServiceGroup.tenant_id` matches actor's tenant context (or actor is OP cross-tenant)
- All member appointments still have `status = AWAITING_INSPECTOR`

**Input DTO:**

```typescript
interface PublishServiceGroupInput {
  groupId: string;
  requestId: string;
}
```

**Process:**
1. Load service group, assert `status = DRAFT`.
2. Verify all member appointments are still `AWAITING_INSPECTOR`.
3. Transition group: `DRAFT → PUBLISHED`.
4. Increment `offered_count += 1`.
5. If `priorityMode = PRIORITY_24H`, confirm `priorityExpiresAt` is still in the future.
6. Write audit log: `action = SERVICE_GROUP_PUBLISHED`.
7. Emit domain event `service_group.published.v1`.
8. If `priorityMode = PRIORITY_24H`, enqueue `service_group.priority_expiry` job scheduled at `priorityExpiresAt`.

**Output:**

```typescript
interface PublishServiceGroupOutput {
  id: string;
  status: 'PUBLISHED';
  offeredCount: number;
  publishedAt: string;
}
```

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `SERVICE_GROUP_NOT_FOUND` | 404 | Group not found in tenant scope |
| `SERVICE_GROUP_INVALID_STATUS` | 422 | Group is not `DRAFT` |
| `APPOINTMENT_INVALID_STATUS` | 422 | A member appointment is no longer `AWAITING_INSPECTOR` |
| `PRIORITY_EXPIRED` | 422 | `PRIORITY_24H` but `priorityExpiresAt` is in the past |

---

### 3.3 AssignInspectorManually

**Name:** `AssignInspectorManuallyUseCase`
**Actor:** OP, AM
**File:** `application/use-cases/AssignInspectorManuallyUseCase.ts`

**Preconditions:**
- Actor has role `OP` or `AM`
- `ServiceGroup.status` is `DRAFT` or `PUBLISHED`
- Inspector exists, is active, and is eligible for the group's service type

**Input DTO:**

```typescript
interface AssignInspectorManuallyInput {
  groupId: string;
  inspectorId: string;
  requestId: string;
}
```

**Process:**
1. Load service group; assert status is `DRAFT` or `PUBLISHED`.
2. Load inspector; assert `status = ACTIVE`.
3. Assert inspector's `service_types_json` includes the group's `service_type_id`.
4. Set `assigned_inspector_id = inspectorId`.
5. Transition group: current status → `ACCEPTED`.
6. For each member appointment: transition `AWAITING_INSPECTOR → SCHEDULED` (via appointment domain command), setting `inspector_id`.
7. Write audit log: `action = SERVICE_GROUP_MANUALLY_ASSIGNED`, `reason = "Manual assignment by {actor.role}"`.
8. Emit domain event `service_group.accepted.v1` with `assignmentType: 'MANUAL'`.
9. Enqueue `notification.send` for each appointment's `INSPECTION_CONFIRMED` event.

**Output:**

```typescript
interface AssignInspectorManuallyOutput {
  id: string;
  status: 'ACCEPTED';
  assignedInspectorId: string;
  appointmentsScheduled: number;
}
```

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `SERVICE_GROUP_NOT_FOUND` | 404 | Group not found |
| `SERVICE_GROUP_INVALID_STATUS` | 422 | Group is not `DRAFT` or `PUBLISHED` |
| `INSPECTOR_NOT_FOUND` | 404 | Inspector not found |
| `INSPECTOR_INACTIVE` | 422 | Inspector is not active |
| `INSPECTOR_SERVICE_TYPE_INELIGIBLE` | 422 | Inspector cannot perform this service type |

---

### 3.4 ListServiceGroups

**Name:** `ListServiceGroupsUseCase`
**Actor:** AM, OP
**File:** `application/use-cases/ListServiceGroupsUseCase.ts`

**Preconditions:**
- Actor has role `AM` or `OP`
- `AM` can query across all tenants; `OP` is scoped to assigned tenants

**Input DTO:**

```typescript
interface ListServiceGroupsInput {
  tenantId?: string;          // AM only; OP scoped to their context
  status?: ServiceGroupStatus | ServiceGroupStatus[];
  serviceTypeId?: string;
  scheduledDateFrom?: string; // ISO date
  scheduledDateTo?: string;   // ISO date
  priorityMode?: PriorityMode;
  page: number;               // min 1
  pageSize: number;           // min 1, max 100
  sortBy?: 'scheduled_date' | 'created_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}
```

**Process:**
1. Build query scoped to `tenant_id` (AM and OP: from `tenantId` param or all — both cross-tenant per `specs/DECISIONS.md` DEC-003; CL roles: derived from JWT). Superseded phrasing: "OP: from auth context; AM: from `tenantId` param or all".
2. Apply filters.
3. Return paginated result.

**Output:**

```typescript
interface ListServiceGroupsOutput {
  data: ServiceGroupSummary[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ServiceGroupSummary {
  id: string;
  tenantId: string;
  serviceTypeId: string;
  serviceTypeName: string;
  status: ServiceGroupStatus;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: string;
  timeWindow: string;
  priorityMode: PriorityMode;
  priorityExpiresAt: string | null;
  assignedInspectorId: string | null;
  assignedInspectorName: string | null;
  createdAt: string;
}
```

---

### 3.5 GetMarketplaceOffers

**Name:** `GetMarketplaceOffersUseCase`
**Actor:** INSP
**File:** `application/use-cases/GetMarketplaceOffersUseCase.ts`

**Preconditions:**
- Actor has role `INSP`
- Inspector account exists and is active

**Input DTO:**

```typescript
interface GetMarketplaceOffersInput {
  inspectorId: string;  // derived from auth JWT
  page: number;
  pageSize: number;
}
```

**Process:**
1. Load inspector record; assert active.
2. Load inspector's `regions_json` and `service_types_json`.
3. Query `service_groups` where:
   - `status = PUBLISHED`
   - `scheduled_date >= today`
   - `service_type_id IN inspector.service_types_json`
4. Filter by region intersection: group's member appointments must have at least one property in inspector's `regions_json`. This may be precomputed or done via a regions overlap check on `appointments.property.suburb` or geocoordinates.
5. Check `client_eligibility_json` on inspector: if the inspector has tenant restrictions, filter out ineligible tenants.
6. Return paginated results sorted by `scheduled_date ASC`.

**Output:**

```typescript
interface MarketplaceOfferSummary {
  groupId: string;
  tenantName: string;         // agency name (not sensitive details)
  serviceTypeName: string;
  groupSize: number;
  scheduledDate: string;
  timeWindow: string;
  priorityMode: PriorityMode;
  priorityExpiresAt: string | null;
  suburbs: string[];          // distinct suburbs in the group
  estimatedDistance: number | null; // km from inspector's last known location
}
```

---

### 3.6 AcceptOffer

**Name:** `AcceptOfferUseCase`
**Actor:** INSP
**File:** `application/use-cases/AcceptOfferUseCase.ts`

**Critical:** This use case must handle concurrent acceptance safely. First valid acceptance wins.

**Preconditions:**
- Actor has role `INSP`
- Inspector is active and eligible for the group
- `ServiceGroup.status = PUBLISHED`
- `Idempotency-Key` header present

**Input DTO:**

```typescript
interface AcceptOfferInput {
  groupId: string;
  inspectorId: string;      // from auth JWT
  idempotencyKey: string;   // from Idempotency-Key header
  requestId: string;
}
```

**Process:**
1. Check idempotency store for `idempotencyKey`:
   - If found with same payload: return cached result (HTTP 200).
   - If found with different payload: return HTTP 409 CONFLICT.
2. Load service group with pessimistic row lock (`SELECT FOR UPDATE`).
3. Assert `status = PUBLISHED`. If `ACCEPTED`, return `GROUP_ALREADY_ACCEPTED` error (another inspector won the race).
4. Assert inspector eligibility: active, correct service type, region overlap, client eligibility.
5. If `priorityMode = PRIORITY_24H`, assert `priorityExpiresAt > now()`.
6. In a single database transaction:
   a. Update `service_groups`: `status = ACCEPTED`, `assigned_inspector_id = inspectorId`.
   b. For each member appointment: dispatch `TransitionAppointmentStatusCommand` (`AWAITING_INSPECTOR → SCHEDULED`, `inspector_id = inspectorId`).
7. Write audit log: `action = SERVICE_GROUP_ACCEPTED`.
8. Emit domain event `service_group.accepted.v1`.
9. Enqueue `notification.send` for `INSPECTION_CONFIRMED` per appointment (via pg-boss).
10. Store idempotency result.

**Concurrency mechanism:** Use a database-level advisory lock or `SELECT FOR UPDATE` on the `service_groups` row. The `status` field serves as the final guard: if two requests arrive simultaneously, only one will see `status = PUBLISHED` after acquiring the lock.

**Output:**

```typescript
interface AcceptOfferOutput {
  groupId: string;
  status: 'ACCEPTED';
  assignedInspectorId: string;
  appointmentsScheduled: number;
  acceptedAt: string;
}
```

**Errors:**

| Code | HTTP | Condition |
|------|------|-----------|
| `SERVICE_GROUP_NOT_FOUND` | 404 | Group not found or not visible to inspector |
| `SERVICE_GROUP_INVALID_STATUS` | 422 | Group is not `PUBLISHED` |
| `GROUP_ALREADY_ACCEPTED` | 409 | Another inspector accepted first |
| `INSPECTOR_INELIGIBLE` | 422 | Inspector does not meet eligibility criteria |
| `PRIORITY_EXPIRED` | 422 | `PRIORITY_24H` window expired |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different payload |
| `MISSING_IDEMPOTENCY_KEY` | 400 | `Idempotency-Key` header absent |

**Side effects:**
- All member appointments transition to `SCHEDULED` with `inspector_id` set.
- Domain event `service_group.accepted.v1` emitted.
- `notification.send` jobs enqueued for each appointment.
- Audit log written.

---

### 3.7 GetServiceGroup

**Name:** `GetServiceGroupUseCase`
**Actor:** AM, OP
**File:** `application/use-cases/GetServiceGroupUseCase.ts`

**Input DTO:**

```typescript
interface GetServiceGroupInput {
  groupId: string;
  requestId: string;
}
```

**Output:** Full `ServiceGroupDetail` including member appointments list (summary), inspector details if assigned, timestamps.

---

## 4. API Contracts

### 4.1 GET /v1/service-groups

**Auth:** Bearer JWT
**Roles:** AM, OP
**Rate limit:** 60 req/min per user

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | string | No (AM only) | Filter by tenant |
| `status` | string | No | `DRAFT\|PUBLISHED\|ACCEPTED\|CANCELLED` |
| `serviceTypeId` | string | No | Filter by service type |
| `scheduledDateFrom` | string | No | ISO date `YYYY-MM-DD` |
| `scheduledDateTo` | string | No | ISO date `YYYY-MM-DD` |
| `priorityMode` | string | No | `STANDARD\|PRIORITY_24H` |
| `page` | integer | No | Default: 1 |
| `pageSize` | integer | No | Default: 20, max: 100 |
| `sortBy` | string | No | `scheduled_date\|created_at\|status` |
| `sortOrder` | string | No | `asc\|desc` |

**Success Response 200:**

```json
{
  "data": [
    {
      "id": "cldxxx",
      "tenantId": "cldyyy",
      "serviceTypeId": "cldzz",
      "serviceTypeName": "Routine Inspection",
      "status": "PUBLISHED",
      "groupSize": 10,
      "offeredCount": 1,
      "confirmedCount": 0,
      "scheduledDate": "2026-04-01",
      "timeWindow": "08:00-12:00",
      "priorityMode": "STANDARD",
      "priorityExpiresAt": null,
      "assignedInspectorId": null,
      "assignedInspectorName": null,
      "createdAt": "2026-03-15T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `AM` or `OP` |

---

### 4.2 POST /v1/service-groups

**Auth:** Bearer JWT
**Roles:** OP
**Rate limit:** 30 req/min per user

**Request Body:**

```json
{
  "appointmentIds": ["cld1", "cld2", "..."],
  "serviceTypeId": "cldabc",
  "scheduledDate": "2026-04-01",
  "timeWindow": "08:00-12:00",
  "priorityMode": "STANDARD"
}
```

**Zod Validation Schema:**

```typescript
const CreateServiceGroupBodySchema = z.object({
  appointmentIds: z.array(z.string().cuid()).min(5).max(25),
  serviceTypeId: z.string().cuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeWindow: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/),
  priorityMode: z.enum(['STANDARD', 'PRIORITY_24H']),
});
```

**Success Response 201:**

```json
{
  "id": "cldnew",
  "tenantId": "cldyyy",
  "serviceTypeId": "cldabc",
  "status": "DRAFT",
  "groupSize": 10,
  "scheduledDate": "2026-04-01",
  "timeWindow": "08:00-12:00",
  "priorityMode": "STANDARD",
  "priorityExpiresAt": null,
  "createdAt": "2026-03-15T10:00:00.000Z"
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `OP` |
| `VALIDATION_ERROR` | 400 | Body fails Zod schema |
| `APPOINTMENT_NOT_FOUND` | 404 | Any appointmentId not found |
| `APPOINTMENT_INVALID_STATUS` | 422 | Appointment not `AWAITING_INSPECTOR` |
| `APPOINTMENT_ALREADY_IN_GROUP` | 422 | Appointment already in a group |
| `SERVICE_TYPE_MISMATCH` | 422 | Mixed service types |
| `GROUP_SIZE_TOO_SMALL` | 422 | Less than 5 appointments |
| `GROUP_SIZE_TOO_LARGE` | 422 | More than 25 appointments |

---

### 4.3 GET /v1/service-groups/:groupId

**Auth:** Bearer JWT
**Roles:** AM, OP
**Rate limit:** 120 req/min per user

**Path Parameters:** `groupId` (string, cuid)

**Success Response 200:**

```json
{
  "id": "cldxxx",
  "tenantId": "cldyyy",
  "serviceTypeId": "cldzz",
  "serviceTypeName": "Routine Inspection",
  "status": "ACCEPTED",
  "groupSize": 10,
  "offeredCount": 1,
  "confirmedCount": 10,
  "scheduledDate": "2026-04-01",
  "timeWindow": "08:00-12:00",
  "priorityMode": "STANDARD",
  "priorityExpiresAt": null,
  "assignedInspectorId": "cldinsp",
  "assignedInspectorName": "John Smith",
  "appointments": [
    {
      "id": "cldapt1",
      "propertyAddress": "123 Main St, Sydney NSW 2000",
      "status": "SCHEDULED"
    }
  ],
  "createdAt": "2026-03-15T10:00:00.000Z",
  "updatedAt": "2026-03-15T11:00:00.000Z"
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `AM` or `OP` |
| `SERVICE_GROUP_NOT_FOUND` | 404 | Group not found in tenant scope |

---

### 4.4 POST /v1/service-groups/:groupId/publish

**Auth:** Bearer JWT
**Roles:** OP
**Rate limit:** 30 req/min per user

**Path Parameters:** `groupId` (string, cuid)

**Request Body:** None required.

**Success Response 200:**

```json
{
  "id": "cldxxx",
  "status": "PUBLISHED",
  "offeredCount": 1,
  "publishedAt": "2026-03-15T10:00:00.000Z"
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `OP` |
| `SERVICE_GROUP_NOT_FOUND` | 404 | Group not found |
| `SERVICE_GROUP_INVALID_STATUS` | 422 | Group is not `DRAFT` |
| `APPOINTMENT_INVALID_STATUS` | 422 | Member appointment changed status |

---

### 4.5 POST /v1/service-groups/:groupId/assign

**Auth:** Bearer JWT
**Roles:** OP, AM
**Rate limit:** 30 req/min per user

**Path Parameters:** `groupId` (string, cuid)

**Request Body:**

```json
{
  "inspectorId": "cldinsp123"
}
```

**Zod Validation Schema:**

```typescript
const AssignInspectorBodySchema = z.object({
  inspectorId: z.string().cuid(),
});
```

**Success Response 200:**

```json
{
  "id": "cldxxx",
  "status": "ACCEPTED",
  "assignedInspectorId": "cldinsp123",
  "appointmentsScheduled": 10
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `OP` or `AM` |
| `SERVICE_GROUP_NOT_FOUND` | 404 | Group not found |
| `SERVICE_GROUP_INVALID_STATUS` | 422 | Group not `DRAFT` or `PUBLISHED` |
| `INSPECTOR_NOT_FOUND` | 404 | Inspector not found |
| `INSPECTOR_INACTIVE` | 422 | Inspector is inactive |
| `INSPECTOR_SERVICE_TYPE_INELIGIBLE` | 422 | Inspector cannot perform service type |

---

### 4.6 GET /v1/marketplace/offers

**Auth:** Bearer JWT
**Roles:** INSP
**Rate limit:** 60 req/min per inspector

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | integer | No | Default: 1 |
| `pageSize` | integer | No | Default: 20, max: 50 |

**Success Response 200:**

```json
{
  "data": [
    {
      "groupId": "cldxxx",
      "tenantName": "XYZ Realty",
      "serviceTypeName": "Routine Inspection",
      "groupSize": 10,
      "scheduledDate": "2026-04-01",
      "timeWindow": "08:00-12:00",
      "priorityMode": "STANDARD",
      "priorityExpiresAt": null,
      "suburbs": ["Bondi", "Coogee", "Randwick"],
      "estimatedDistance": 12.5
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 3,
    "totalPages": 1
  }
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `INSP` |

---

### 4.7 POST /v1/marketplace/offers/:groupId/accept

**Auth:** Bearer JWT
**Roles:** INSP
**Rate limit:** 20 req/min per inspector
**Required Header:** `Idempotency-Key: <uuid>`

**Path Parameters:** `groupId` (string, cuid)

**Request Body:** None required.

**Headers:**

```
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

**Success Response 200:**

```json
{
  "groupId": "cldxxx",
  "status": "ACCEPTED",
  "assignedInspectorId": "cldinsp",
  "appointmentsScheduled": 10,
  "acceptedAt": "2026-03-15T10:00:00.000Z"
}
```

**Errors:**

| Code | HTTP | Scenario |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Role not `INSP` |
| `MISSING_IDEMPOTENCY_KEY` | 400 | `Idempotency-Key` header absent |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key used with different payload |
| `SERVICE_GROUP_NOT_FOUND` | 404 | Group not found or not visible to inspector |
| `SERVICE_GROUP_INVALID_STATUS` | 422 | Group is not `PUBLISHED` |
| `GROUP_ALREADY_ACCEPTED` | 409 | Another inspector accepted first |
| `INSPECTOR_INELIGIBLE` | 422 | Inspector does not meet eligibility criteria |
| `PRIORITY_EXPIRED` | 422 | 24h priority window expired |

---

## 5. Business Rules

**BR-01 — Minimum group size is 5.**
Groups must contain at least 5 appointments. Exceptions (low-density regions, isolated services, priority clients) require OP/AM to explicitly override via a future `overrideMinSize: true` flag. Default enforcement: 422 if `< 5`.

**BR-02 — Maximum group size is 25.**
Groups must contain at most 25 appointments. Enforcement: 422 if `> 25`.

**BR-03 — No mixing of service types.**
All appointments in a group must share the same `service_type_id`. Mixed service type groups are rejected at creation time.

**BR-04 — Priority 24h mode is not global.**
`PRIORITY_24H` is configurable per client, branch, or operational region — not available to all tenants by default. The API must validate that the group's tenant has 24h priority enabled before allowing `priorityMode = PRIORITY_24H`.

**BR-05 — First valid acceptance wins.**
When two inspectors simultaneously attempt to accept the same published group, the system uses a pessimistic row lock (`SELECT FOR UPDATE`) to serialize. The first valid acceptance transitions the group to `ACCEPTED`. Subsequent attempts receive `GROUP_ALREADY_ACCEPTED` (HTTP 409).

**BR-06 — Idempotency is mandatory on accept.**
`POST /v1/marketplace/offers/:groupId/accept` requires an `Idempotency-Key` header. Absence of this header returns HTTP 400 `MISSING_IDEMPOTENCY_KEY`.

**BR-07 — Appointment validation before group creation.**
All appointments in the creation request must: (a) exist within the tenant scope, (b) have `status = AWAITING_INSPECTOR`, (c) not already belong to a group (`service_group_id IS NULL`).

**BR-08 — Routine group without accept: operator replanning.**
If a `STANDARD` group is not accepted before `scheduled_date`, the operator must either: (a) reschedule the group to a future date (re-publish), (b) dissolve the group (unlink appointments, return to `AWAITING_INSPECTOR`), or (c) manually assign an inspector. No automatic expiry is implemented — alerts are sent via `service_group.no_accept_alert` job.

**BR-09 — Ingoing/Outgoing group without accept: 24h WhatsApp alert.**
For groups containing `Ingoing` or `Outgoing` service type appointments, if the group is `PUBLISHED` and `scheduled_date - 24h` is reached without acceptance, the system enqueues a `notification.send` (WHATSAPP channel) to all eligible inspectors in the group's region, and an alert to the operator.

**BR-10 — Manual assignment bypasses marketplace eligibility checks (with audit).**
OP/AM can assign any active inspector to a group regardless of region/service-type eligibility. The system records the override in the audit log with actor identity.

**BR-11 — Inspector eligibility for marketplace is multi-dimensional.**
An inspector is eligible for a published group if ALL of the following are true:
- `inspector.status = ACTIVE`
- Group's `service_type_id` is in `inspector.service_types_json`
- At least one appointment's property suburb/region intersects `inspector.regions_json`
- The group's `tenant_id` is not in inspector's excluded tenants (`client_eligibility_json`)

**BR-12 — Priority expiry invalidates the offer.**
If `priorityMode = PRIORITY_24H` and `priorityExpiresAt < now()`, the group can no longer be accepted by inspectors. The `service_group.priority_expiry` job transitions it back to `DRAFT` and notifies the operator.

**BR-13 — Audit log required on all transitions.**
Every status change on a service group must produce an `AuditLog` entry with: `entity_type = SERVICE_GROUP`, `entity_id`, `actor_type`, `actor_id`, `action`, `before_json`, `after_json`, `request_id`.

**BR-14 — All appointments in group transition atomically.**
When a group is accepted (marketplace or manual), all member appointments must transition to `SCHEDULED` in the same database transaction. Partial success is not acceptable.

**BR-15 — A cancelled group does not release appointments automatically.**
When a group is cancelled, appointments are unlinked (`service_group_id = NULL`) and return to `AWAITING_INSPECTOR` status, making them available for a new group. This is handled by the `CancelServiceGroupUseCase` (future scope — not in MVP unless specified).

---

## 6. Authorization Matrix

| Action | AM | OP | CL_ADMIN | CL_USER | INSP | TNT |
|--------|----|----|----------|---------|------|-----|
| List service groups | Yes | Yes | No | No | No | No |
| Get service group detail | Yes | Yes | No | No | No | No |
| Create service group | No | Yes | No | No | No | No |
| Publish service group | No | Yes | No | No | No | No |
| Assign inspector manually | Yes | Yes | No | No | No | No |
| Cancel service group | Yes | Yes | No | No | No | No |
| View marketplace offers | No | No | No | No | Yes | No |
| Accept marketplace offer | No | No | No | No | Yes | No |

**Notes:**
- `OP` is scoped to their assigned tenants; `AM` is platform-wide.
- `INSP` can only see groups for which they are eligible (region + service type).
- Manual assignment by `OP` overrides eligibility constraints but requires audit.

---

## 7. Domain Events

All events are published to the internal event bus (pg-boss, PostgreSQL-backed). Consumers must handle events idempotently.

### 7.1 service_group.created.v1

**Trigger:** `CreateServiceGroupUseCase` success
**Publisher:** service-group module

```typescript
interface ServiceGroupCreatedEventV1 {
  eventType: 'service_group.created.v1';
  eventId: string;         // uuid v4
  occurredAt: string;      // ISO 8601
  payload: {
    groupId: string;
    tenantId: string;
    serviceTypeId: string;
    groupSize: number;
    scheduledDate: string;
    timeWindow: string;
    priorityMode: PriorityMode;
    createdByUserId: string;
    appointmentIds: string[];
    requestId: string;
  };
}
```

### 7.2 service_group.published.v1

**Trigger:** `PublishServiceGroupUseCase` success

```typescript
interface ServiceGroupPublishedEventV1 {
  eventType: 'service_group.published.v1';
  eventId: string;
  occurredAt: string;
  payload: {
    groupId: string;
    tenantId: string;
    serviceTypeId: string;
    groupSize: number;
    scheduledDate: string;
    timeWindow: string;
    priorityMode: PriorityMode;
    priorityExpiresAt: string | null;
    offeredCount: number;
    publishedByUserId: string;
    requestId: string;
  };
}
```

### 7.3 service_group.accepted.v1

**Trigger:** `AcceptOfferUseCase` or `AssignInspectorManuallyUseCase` success

```typescript
interface ServiceGroupAcceptedEventV1 {
  eventType: 'service_group.accepted.v1';
  eventId: string;
  occurredAt: string;
  payload: {
    groupId: string;
    tenantId: string;
    serviceTypeId: string;
    assignedInspectorId: string;
    assignmentType: 'MARKETPLACE' | 'MANUAL';
    scheduledDate: string;
    timeWindow: string;
    appointmentIds: string[];
    acceptedByActorId: string;
    acceptedByActorRole: string;
    requestId: string;
  };
}
```

**Consumers:**
- Appointment module: transitions all listed appointments to `SCHEDULED`
- Notification module: enqueues `INSPECTION_CONFIRMED` per appointment

### 7.4 service_group.priority_expired.v1

**Trigger:** `service_group.priority_expiry` job execution

```typescript
interface ServiceGroupPriorityExpiredEventV1 {
  eventType: 'service_group.priority_expired.v1';
  eventId: string;
  occurredAt: string;
  payload: {
    groupId: string;
    tenantId: string;
    scheduledDate: string;
    expiredAt: string;
    requestId: string;
  };
}
```

### 7.5 service_group.no_accept_alert.v1

**Trigger:** `service_group.no_accept_check` scheduled job

```typescript
interface ServiceGroupNoAcceptAlertEventV1 {
  eventType: 'service_group.no_accept_alert.v1';
  eventId: string;
  occurredAt: string;
  payload: {
    groupId: string;
    tenantId: string;
    serviceTypeCode: string;   // 'ROUTINE' | 'INGOING' | 'OUTGOING'
    scheduledDate: string;
    hoursUntilScheduled: number;
    requestId: string;
  };
}
```

---

## 8. Queue Jobs

### 8.1 service_group.priority_expiry

**Queue:** `service-group`
**Job name:** `service_group.priority_expiry`
**Scheduled at:** `priorityExpiresAt` (set when group is published with `PRIORITY_24H`)

**Payload:**

```typescript
interface PriorityExpiryJobPayload {
  groupId: string;
  tenantId: string;
  requestId: string;
}
```

**Process:**
1. Load group; if already `ACCEPTED` or `CANCELLED`, no-op.
2. If still `PUBLISHED`: transition to `DRAFT`, clear `priorityExpiresAt`.
3. Emit `service_group.priority_expired.v1`.
4. Enqueue operator alert notification.

**Retry policy:** 3 attempts; 15s, 45s, 2min. No DLQ (idempotent — if missed, group stays PUBLISHED but inspectors will get `PRIORITY_EXPIRED` on accept attempt).

---

### 8.2 service_group.no_accept_check

**Queue:** `service-group`
**Job name:** `service_group.no_accept_check`
**Scheduled at:** `scheduled_date - 24h` (for INGOING/OUTGOING groups) and `scheduled_date - 1h` (for all PUBLISHED groups as a final check)

**Payload:**

```typescript
interface NoAcceptCheckJobPayload {
  groupId: string;
  tenantId: string;
  serviceTypeCode: string;
  requestId: string;
}
```

**Process:**
1. Load group; if not `PUBLISHED`, no-op.
2. Emit `service_group.no_accept_alert.v1`.
3. For INGOING/OUTGOING: enqueue WHATSAPP notifications to all eligible inspectors in the region.
4. Send operator alert (EMAIL or in-app notification).

**Retry policy:** 3 attempts; 15s, 45s, 2min.

---

## 9. External Integrations

### 9.1 Geocoding / Region Intersection (Mapbox)

**Purpose:** Compute region intersection between inspector's `regions_json` and group's appointment property coordinates.

**Service:** Mapbox Geocoding API
**Endpoint:** `https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json`
**Used for:** Converting suburb names to coordinates when `regions_json` is suburb-based (not GeoJSON polygon).

**Fallback:** If Mapbox is unavailable, fall back to suburb string comparison (exact match on `suburb` field). Log the fallback occurrence. Do not block the marketplace query — degrade gracefully.

**Circuit breaker:** 5 consecutive failures in 30s → open circuit for 60s, use fallback.

### 9.2 Notification Service (Internal)

**Purpose:** Trigger `INSPECTION_CONFIRMED` notifications when a group is accepted.

**Integration:** Internal pg-boss job enqueue — not an external HTTP call.
**Job:** `notification.send` (see notification module spec)

---

## 10. Test Scenarios

### 10.1 Unit Tests

Located at: `src/modules/service-group/application/use-cases/__tests__/`

**CreateServiceGroupUseCase:**
```
[ ] Creates group successfully with 5–25 valid AWAITING_INSPECTOR appointments of same service type
[ ] Rejects when appointmentIds.length < 5 → GROUP_SIZE_TOO_SMALL
[ ] Rejects when appointmentIds.length > 25 → GROUP_SIZE_TOO_LARGE
[ ] Rejects when any appointment is not AWAITING_INSPECTOR → APPOINTMENT_INVALID_STATUS
[ ] Rejects when appointments have mixed service types → SERVICE_TYPE_MISMATCH
[ ] Rejects when any appointment already has service_group_id → APPOINTMENT_ALREADY_IN_GROUP
[ ] Rejects when any appointmentId does not belong to actor's tenant → APPOINTMENT_NOT_FOUND
[ ] Sets priorityExpiresAt when priorityMode = PRIORITY_24H
[ ] Rejects PRIORITY_24H when scheduledDate < now + 24h → PRIORITY_DATE_TOO_CLOSE
[ ] Creates audit log entry on success
[ ] Emits service_group.created.v1 event on success
```

**PublishServiceGroupUseCase:**
```
[ ] Transitions DRAFT → PUBLISHED successfully
[ ] Increments offeredCount
[ ] Rejects when group is not DRAFT → SERVICE_GROUP_INVALID_STATUS
[ ] Rejects when a member appointment is no longer AWAITING_INSPECTOR
[ ] Enqueues priority_expiry job when priorityMode = PRIORITY_24H
```

**AcceptOfferUseCase:**
```
[ ] Accepts offer successfully, transitions group to ACCEPTED
[ ] Sets assigned_inspector_id
[ ] Transitions all member appointments to SCHEDULED
[ ] Emits service_group.accepted.v1 event
[ ] Returns cached result for same idempotency key + same payload (HTTP 200)
[ ] Returns IDEMPOTENCY_CONFLICT for same key + different payload (HTTP 409)
[ ] Returns MISSING_IDEMPOTENCY_KEY when header absent
[ ] Returns GROUP_ALREADY_ACCEPTED when group is already ACCEPTED (concurrent scenario)
[ ] Returns INSPECTOR_INELIGIBLE when inspector's service types do not match
[ ] Returns PRIORITY_EXPIRED when PRIORITY_24H window has passed
[ ] All appointment transitions are atomic (DB transaction rollback on failure)
```

**AssignInspectorManuallyUseCase:**
```
[ ] Assigns inspector to DRAFT group
[ ] Assigns inspector to PUBLISHED group
[ ] Transitions all appointments to SCHEDULED
[ ] Records audit log with MANUAL assignment type
[ ] Rejects when inspector is INACTIVE → INSPECTOR_INACTIVE
[ ] Rejects when inspector service type mismatch (no override flag set)
```

**GetMarketplaceOffersUseCase:**
```
[ ] Returns only PUBLISHED groups
[ ] Filters by inspector's service_types_json
[ ] Filters by inspector's regions_json (suburb intersection)
[ ] Excludes groups from tenants in inspector's client_eligibility_json exclusion list
[ ] Returns empty list when inspector has no eligible regions
[ ] Does not return expired PRIORITY_24H groups
```

### 10.2 Integration Tests (Supertest)

Located at: `src/modules/service-group/interfaces/http/__tests__/`

```
[ ] POST /v1/service-groups — 201 with valid body as OP
[ ] POST /v1/service-groups — 403 as CL_ADMIN
[ ] POST /v1/service-groups — 422 with < 5 appointmentIds
[ ] POST /v1/service-groups — 404 with unknown appointmentId
[ ] GET /v1/service-groups — 200 with pagination as AM
[ ] GET /v1/service-groups — 200 scoped to OP's tenant
[ ] POST /v1/service-groups/:id/publish — 200 as OP on DRAFT group
[ ] POST /v1/service-groups/:id/publish — 422 on non-DRAFT group
[ ] POST /v1/service-groups/:id/assign — 200 as OP with valid inspector
[ ] GET /v1/marketplace/offers — 200 as INSP, only eligible groups
[ ] POST /v1/marketplace/offers/:id/accept — 200 with Idempotency-Key as INSP
[ ] POST /v1/marketplace/offers/:id/accept — 400 without Idempotency-Key
[ ] POST /v1/marketplace/offers/:id/accept — 409 when group already ACCEPTED
[ ] POST /v1/marketplace/offers/:id/accept — 200 idempotent (same key, same result)
```

### 10.3 Edge Cases

```
[ ] Two concurrent accept requests arrive simultaneously — only one succeeds (409 for second)
[ ] Accept succeeds but one appointment transition fails mid-way — full rollback, group stays PUBLISHED
[ ] Group published but all appointments are cancelled before acceptance — error on accept
[ ] Priority 24h group reaches expiry while a concurrent accept is in flight — accept wins if lock acquired before expiry job
[ ] Inspector with empty regions_json sees no marketplace offers
[ ] Creating group with exactly 5 appointments from different branches of same tenant — success
[ ] Creating group with appointments spanning multiple tenants (OP with cross-tenant access) — rejected if tenant_ids differ
```

### 10.4 Security Tests

```
[ ] INSP cannot call GET /v1/service-groups (403)
[ ] CL_ADMIN cannot create service groups (403)
[ ] INSP cannot see marketplace offers for groups in tenants they are excluded from
[ ] OP from tenant A cannot assign inspectors to groups in tenant B (tenant isolation)
[ ] TNT role cannot access any service group endpoint (403)
[ ] Expired JWT returns 401 on all endpoints
[ ] Service group details do not leak tenant-sensitive information to INSP in marketplace offers
```
