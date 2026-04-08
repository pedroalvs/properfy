# Service Group Endpoints (Operator)

**Feature**: `005-service-groups-marketplace`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/service-group/interfaces/service-group.routes.ts`, `packages/shared/src/schemas/service-group.ts`

All endpoints require `AM` or `OP` unless otherwise noted.

---

## POST `/v1/service-groups`

Create a new service group from a set of eligible appointments.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`service_group.created`)
- **Side effects**: links appointments via `service_group_id`; transitions any `DRAFT` appointment to `AWAITING_INSPECTOR`.

**Request body** (`createServiceGroupSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `appointmentIds` | string[] (1..25 UUIDs) | yes | Domain validator enforces the effective min/max per exception type. |
| `serviceTypeId` | uuid | yes | Must match every appointment's service type. |
| `scheduledDate` | date (`YYYY-MM-DD`) | yes | |
| `timeWindow` | string (`HH:mm-HH:mm`) | yes | Regex-validated. |
| `name` | string (1..255) | no | Operator-facing label. |
| `serviceRegionId` | uuid | no | Required before publication. |
| `description` | string (max 5000) | no | |
| `priorityMode` | `STANDARD\|PRIORITY_24H` | no | Default `STANDARD`. |
| `exceptionType` | `LOW_DENSITY_REGION\|ISOLATED_SERVICE\|PRIORITY_CLIENT` | no | Must be paired with `exceptionReason`. |
| `exceptionReason` | string (10..1000) | no | Required when `exceptionType` is set. |

**Response 201**: full service group payload (see `serviceGroupResponseSchema`).

**Error codes**: `AUTH_FORBIDDEN`, `GROUP_SIZE_TOO_SMALL`, `GROUP_SIZE_TOO_LARGE`, `APPOINTMENT_INVALID_STATUS`, `APPOINTMENT_ALREADY_IN_GROUP`, `SERVICE_TYPE_MISMATCH`, `APPOINTMENT_NOT_FOUND`, `PRIORITY_DATE_TOO_CLOSE`, `SERVICE_REGION_NOT_FOUND`, `SERVICE_REGION_INACTIVE`, `VALIDATION_ERROR`.

---

## GET `/v1/service-groups`

List service groups with filters and pagination.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`, `CL_ADMIN`, `CL_USER` (client roles scoped to own tenant)

**Query params** (`listServiceGroupsQuerySchema`)

| Name | Type | Notes |
|---|---|---|
| `page`, `pageSize` | int | |
| `tenantId` | uuid | AM/OP only; ignored for client roles. |
| `status` | `DRAFT\|PUBLISHED\|ACCEPTED\|CANCELLED\|REJECTED` | |
| `serviceTypeId` | uuid | |
| `scheduledDateFrom` / `scheduledDateTo` | date | |
| `priorityMode` | `STANDARD\|PRIORITY_24H` | |
| `sortBy`, `sortOrder` | | |

**Response 200**: paginated service group payloads.

---

## GET `/v1/service-groups/:groupId`

Read a single service group (includes linked appointment summaries).

- **Auth**: required
- **Allowed roles**: `AM`, `OP`, and client roles with tenant scope.

**Error codes**: `SERVICE_GROUP_NOT_FOUND`, `AUTH_FORBIDDEN`.

---

## PATCH `/v1/service-groups/:groupId`

Update mutable metadata.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`service_group.updated`)

**Request body** (`updateServiceGroupSchema`, all fields optional)

| Field | Type | Notes |
|---|---|---|
| `name` | string (1..255) | |
| `serviceRegionId` | uuid \| null | |
| `description` | string (max 5000) | |

> `scheduledDate`, `timeWindow`, `priorityMode`, `exceptionType`, and `appointmentIds` are **not** updatable in Phase 1 (see GAP-009).

**Response 200**: full service group payload.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_GROUP_NOT_FOUND`, `VALIDATION_ERROR`.

---

## POST `/v1/service-groups/:groupId/publish`

Publish a `DRAFT` group to the inspector marketplace. Idempotent.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`service_group.published`)

**Request body**: none.

**Response 200**: full service group payload with `status = PUBLISHED`, `publishedAt` set, `offeredCount` incremented.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_GROUP_NOT_FOUND`, `SERVICE_GROUP_INVALID_STATUS`, `SERVICE_REGION_REQUIRED`, `SERVICE_REGION_INACTIVE`, `APPOINTMENT_INVALID_STATUS`, `PRIORITY_EXPIRED`.

---

## POST `/v1/service-groups/:groupId/assign`

Manually assign an inspector to a `DRAFT` or `PUBLISHED` group, bypassing the marketplace. Transitions the group to `ACCEPTED` and schedules its appointments.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`service_group.manually_assigned`, reason `"Manual assignment by <role>"`)

**Request body** (`assignInspectorSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `inspectorId` | uuid | yes | |

**Response 200**: `{ id, status, assignedInspectorId, appointmentsScheduled }`.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_GROUP_NOT_FOUND`, `SERVICE_GROUP_INVALID_STATUS`, `ASSIGNED_INSPECTOR_CONFLICT`, `INSPECTOR_NOT_FOUND`, `INSPECTOR_INACTIVE`, `INSPECTOR_SERVICE_TYPE_INELIGIBLE`, `INSPECTOR_INELIGIBLE`.

---

## POST `/v1/service-groups/:groupId/cancel`

Cancel a group. Valid from `DRAFT`, `PUBLISHED`, or `ACCEPTED`. Detaches linked appointments so they become regroupable.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`service_group.cancelled`, carries `reason`)

**Request body** (`cancelServiceGroupSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string (1..1000) | yes | |

**Response 200**: full service group payload with `status = CANCELLED`.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_GROUP_NOT_FOUND`, `SERVICE_GROUP_INVALID_STATUS`, `VALIDATION_ERROR`.

---

## POST `/v1/service-groups/:groupId/reject`

Reject a group. Valid only from `PUBLISHED` or `ACCEPTED`.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`service_group.rejected`, carries `reason`)

**Request body** (`rejectServiceGroupSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string (1..1000) | yes | |

**Response 200**: full service group payload with `status = REJECTED`.

**Error codes**: `AUTH_FORBIDDEN`, `SERVICE_GROUP_NOT_FOUND`, `SERVICE_GROUP_INVALID_STATUS`, `VALIDATION_ERROR`.
