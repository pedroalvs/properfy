# Inspector Endpoints (Operator)

**Feature**: `008-inspectors-execution`
**Status**: IMPLEMENTED
**Source**: `apps/backend/src/modules/inspector/interfaces/inspector.routes.ts`, `packages/shared/src/schemas/inspector.ts`

All endpoints require `AM` or `OP` unless otherwise noted. OP is scoped to inspectors eligible for their own tenant (via `clientEligibilityJson`); AM has cross-tenant access.

---

## POST `/v1/inspectors`

Create a new inspector.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`inspector.created`)

**Request body** (`createInspectorSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | |
| `email` | email | yes | Globally unique. |
| `phone` | string | no | |
| `paymentSettings` | object | no | Opaque JSON — payout method, bank, tax (GAP-009 for typing). |
| `regions` | string[] | no | **Legacy/transitional** region hints stored in `regions_json` (GAP-002). |
| `regionIds` | uuid[] | no | **Canonical**: Service region UUIDs — populates `inspector_regions` join rows linked to tenant-scoped `ServiceRegion`. |
| `serviceTypes` | uuid[] | no | Service type UUIDs the inspector supports. |
| `clientEligibility` | uuid[] | no | Tenant UUIDs the inspector is allowed to work for. |

**Response 201**: full inspector payload (`inspectorResponseSchema`).

**Error codes**: `AUTH_FORBIDDEN`, `INSPECTOR_EMAIL_CONFLICT`, `VALIDATION_ERROR`.

---

## GET `/v1/inspectors`

List inspectors with filters and pagination.

- **Auth**: required
- **Allowed roles**: `AM` (all inspectors), `OP` (inspectors eligible for own tenant). CL roles have no access in Phase 1.

**Query params** (`listInspectorsQuerySchema`): `page`, `pageSize`, `status`, `search`, `sortBy`, `sortOrder`.

**Response 200**: paginated inspectors.

---

## GET `/v1/inspectors/:inspectorId`

Read a single inspector.

**Response 200**: full detail including linked user summary.

**Error codes**: `INSPECTOR_NOT_FOUND`.

---

## PATCH `/v1/inspectors/:inspectorId`

Update inspector fields.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`inspector.updated`)

**Request body** (`updateInspectorSchema`, all fields optional): same as create minus `email`.

**Response 200**: updated inspector.

---

## POST `/v1/inspectors/:inspectorId/link-user`

Link an inspector record to a user account (enables PWA login).

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`inspector.linked_to_user`)

**Request body** (`linkInspectorToUserSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | uuid | yes | User must have role `INSP`. |

**Response 204** — no body.

**Error codes**: `AUTH_FORBIDDEN`, `INSPECTOR_NOT_FOUND`, `USER_NOT_FOUND`, `INSPECTOR_ALREADY_LINKED`, `VALIDATION_ERROR`.

---

## POST `/v1/inspectors/:inspectorId/deactivate`

Deactivate an inspector. Blocked by open appointments.

- **Auth**: required
- **Allowed roles**: `AM`, `OP`
- **Audit**: yes (`inspector.deactivated`, carries `reason`)

**Request body** (`deactivateSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string (1..500) | yes | |

**Response 200**: inspector summary with `status = INACTIVE`.

**Error codes**: `AUTH_FORBIDDEN`, `INSPECTOR_NOT_FOUND`, `INSPECTOR_ALREADY_INACTIVE`, `INSPECTOR_HAS_OPEN_APPOINTMENTS`.

---

## Availability Slot Routes

Two variants coexist — **flat** (`/v1/availability-slots[/:id]`) and **scoped** (`/v1/inspectors/:inspectorId/availability-slots[/:slotId]`). Both delegate to the same use cases. INSP actors can manage only their own slots (inspector id derived from JWT); AM/OP/CL can pass an inspector id explicitly.

### POST `/v1/availability-slots` (flat) / POST `/v1/inspectors/:inspectorId/availability-slots` (scoped)

Create an availability slot.

**Request body** (`createAvailabilitySlotSchema`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `inspectorId` | uuid | conditional | Required for AM/OP on the flat route. Ignored for INSP (derived from JWT). Ignored on the scoped route (taken from path). |
| `date` | date (`YYYY-MM-DD`) | yes | |
| `startTime` | string (`HH:mm`) | yes | |
| `endTime` | string (`HH:mm`) | yes | |
| `region` | string | no | **Transitional hint**; stored into `regionJson.name`. The canonical direction is to align with tenant-scoped `ServiceRegion` once GAP-002 lands. |
| `regionJson` | object | no | **Transitional hint**: full region object. See `region` note above. |
| `capacity` | int | no | Default 1. |

**Response 201**: availability slot payload.

### GET `/v1/availability-slots` / GET `/v1/inspectors/:inspectorId/availability-slots`

List slots. INSP locked to own; AM/OP can query any or all; CL roles scoped.

### PATCH `/v1/availability-slots/:id` / PATCH `/v1/inspectors/:inspectorId/availability-slots/:slotId`

Update slot fields (`date`, `startTime`, `endTime`, `region`/`regionJson`, `capacity`, `status`).

**Error codes**: `AUTH_FORBIDDEN`, `SLOT_NOT_FOUND`, `VALIDATION_ERROR`.
