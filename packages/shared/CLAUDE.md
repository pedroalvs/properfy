# Shared Package – Guidance for Claude Code

You are working inside **`packages/shared/`** of the Properfy monorepo.

This package is the **single source of truth** for types, enums, schemas and contracts shared between `apps/backend`, `apps/web` and `apps/pwa`. It ensures consistency across the entire stack.

---

## 1. Tech stack

- **Language:** TypeScript
- **Validation:** Zod (schemas that generate both runtime validation and TypeScript types)
- **Package manager:** pnpm (workspace package)
- **Build:** tsup or tsc (emit `.d.ts` + ESM)

---

## 2. Development commands

```bash
# Install dependencies
pnpm install

# Build package
pnpm build

# Run tests
pnpm test

# Typecheck
pnpm typecheck

# Lint
pnpm lint
```

---

## 3. Project structure

```text
packages/shared/
├── src/
│   ├── enums/
│   │   ├── appointment-status.ts
│   │   ├── rental-tenant-confirmation-status.ts
│   │   ├── notification-channel.ts
│   │   ├── notification-status.ts
│   │   ├── financial-entry-type.ts
│   │   ├── user-role.ts
│   │   ├── service-type.ts
│   │   └── index.ts
│   ├── schemas/
│   │   ├── auth.ts               # Login, refresh, JWT payload schemas
│   │   ├── appointment.ts        # Create, update, status transition schemas
│   │   ├── property.ts           # Property CRUD schemas
│   │   ├── service-group.ts      # Group creation, publish schemas
│   │   ├── tenant-portal.ts      # Confirm, reschedule, contact update schemas
│   │   ├── inspector.ts          # Start, finish inspection schemas
│   │   ├── notification.ts       # Notification schemas
│   │   ├── financial.ts          # Financial entry, adjustment, refund schemas
│   │   ├── report.ts             # Report generation schemas
│   │   ├── pagination.ts         # Shared pagination params schema
│   │   ├── error.ts              # Error envelope schema
│   │   └── index.ts
│   ├── types/
│   │   ├── entities.ts           # TypeScript interfaces for all entities
│   │   ├── api.ts                # API request/response types (inferred from Zod schemas)
│   │   ├── pagination.ts         # PaginatedResponse<T>, PaginationParams
│   │   └── index.ts
│   ├── constants/
│   │   ├── status-transitions.ts # Valid transition map
│   │   ├── rate-limits.ts        # Rate limit constants
│   │   └── index.ts
│   ├── utils/
│   │   ├── validators.ts         # Shared validators (CPF, phone, etc. if needed)
│   │   └── index.ts
│   └── index.ts                  # Main barrel export
├── tsconfig.json
├── package.json
└── ...
```

---

## 4. Enums

All business enums must be defined here and imported by all workspaces. Never duplicate enum values locally.

### Appointment status

```typescript
export const AppointmentStatus = {
  DRAFT: 'DRAFT',
  AWAITING_INSPECTOR: 'AWAITING_INSPECTOR',
  SCHEDULED: 'SCHEDULED',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
} as const;

export type AppointmentStatus = typeof AppointmentStatus[keyof typeof AppointmentStatus];
```

### Tenant confirmation status

```typescript
export const RentalTenantConfirmationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  UNAVAILABLE: 'UNAVAILABLE',
  NO_RESPONSE: 'NO_RESPONSE',
} as const;
```

### Notification channel

```typescript
export const NotificationChannel = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
} as const;
```

### Notification status

```typescript
export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
} as const;
```

### Financial entry type

```typescript
export const FinancialEntryType = {
  TENANT_DEBIT: 'TENANT_DEBIT',
  INSPECTOR_PAYOUT: 'INSPECTOR_PAYOUT',
  REFUND: 'REFUND',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
} as const;
```

### User role

```typescript
export const UserRole = {
  AM: 'AM',           // Admin Master
  OP: 'OP',           // Operator
  CL_ADMIN: 'CL_ADMIN', // Client Admin
  CL_USER: 'CL_USER',   // Client User
  INSP: 'INSP',       // Inspector
} as const;
```

---

## 5. Zod schemas

Schemas serve double duty: **runtime validation** (backend) and **TypeScript type inference** (all workspaces).

### Pattern

```typescript
import { z } from 'zod';

// Schema definition
export const createAppointmentSchema = z.object({
  branchId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid(),
  scheduledDate: z.string().date(),
  timeSlot: z.string(),
  contact: z.object({
    tenantName: z.string().min(1),
    primaryEmail: z.string().email().optional(),
    primaryPhone: z.string().optional(),
  }),
  keyRequired: z.boolean().default(false),
  notes: z.string().optional(),
});

// Type inference
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
```

### Shared schemas

- **Pagination:** `paginationParamsSchema` with `page`, `pageSize`, `sortBy`, `sortOrder`
- **Error:** `errorEnvelopeSchema` with `code`, `message`, `details`
- **Status transition:** `statusTransitionSchema` with `targetStatus`, `reason`

---

## 6. Status transition map

The valid transition map is defined here and used by both backend (validation) and frontend (UI logic):

```typescript
export const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  DRAFT: ['AWAITING_INSPECTOR', 'REJECTED', 'CANCELLED'],
  AWAITING_INSPECTOR: ['SCHEDULED', 'CANCELLED', 'REJECTED'],
  SCHEDULED: ['DONE', 'CANCELLED', 'REJECTED'],
  DONE: ['DRAFT', 'REJECTED'],
  CANCELLED: ['DRAFT'],
  REJECTED: ['DRAFT', 'AWAITING_INSPECTOR'],
};
```

---

## 7. Naming conventions

- **TypeScript:** `camelCase` for variables/functions, `PascalCase` for types/interfaces/enums
- **Zod schemas:** `camelCase` with `Schema` suffix (e.g., `createAppointmentSchema`)
- **Enum constants:** `PascalCase` for the const object, `UPPER_SNAKE_CASE` for values
- **Files:** `kebab-case` (e.g., `appointment-status.ts`, `create-appointment.ts`)
- **Barrel exports:** every directory has an `index.ts`

---

## 8. Usage across workspaces

### Backend

```typescript
import { createAppointmentSchema, AppointmentStatus, VALID_TRANSITIONS } from '@properfy/shared';

// Validate in use case
const parsed = createAppointmentSchema.parse(input);

// Check transition
if (!VALID_TRANSITIONS[current].includes(target)) {
  throw new InvalidTransitionError(current, target);
}
```

### Frontend (web/pwa)

```typescript
import { AppointmentStatus, type CreateAppointmentInput } from '@properfy/shared';

// Type-safe form data
const formData: CreateAppointmentInput = { ... };

// Status chip mapping
if (status === AppointmentStatus.DONE) { ... }
```

---

## 9. Testing

- Unit tests for: schema validation (edge cases, invalid inputs), transition map, shared utilities
- Run with Vitest
- Every schema should have tests for valid input, invalid input, and edge cases

---

## 10. Conventions for Claude Code

When you (Claude Code) work on the shared package:

1. **This is the single source of truth** – if a type, enum or schema exists here, do NOT duplicate it in any workspace.
2. **Add Zod schemas for all API contracts** – they generate both validation and types.
3. **Keep it lean** – only shared concerns belong here. Domain-specific logic stays in the backend.
4. **Every new enum or type** used by more than one workspace must go here.
5. **Barrel exports** – always update `index.ts` files.
6. **Test schemas** – every Zod schema needs validation tests.
7. **Naming matters** – use the conventions above consistently.
8. **Breaking changes affect all workspaces** – be careful with schema modifications.
9. **Consult `projeto-consolidado/modelo-dados-executavel.md`** for entity definitions and `projeto-consolidado/api-contratos-principais.md` for API contracts.
