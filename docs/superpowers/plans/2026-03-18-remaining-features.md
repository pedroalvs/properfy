# Remaining Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all remaining production gaps across shared, backend, web, and PWA workspaces to reach full spec compliance.

**Architecture:** The monorepo has 4 workspaces: `packages/shared` (Zod schemas, enums, types), `apps/backend` (Fastify + Clean Architecture), `apps/web` (React SPA), `apps/pwa` (React PWA). Changes flow shared → backend → web/pwa. Each task is independently testable and committable.

**Tech Stack:** TypeScript, Zod, React, Fastify, Vitest, Prisma, React Query, Tailwind CSS, Vite

---

## Overview of Remaining Gaps

### Shared Package (5 tasks)
- Missing TOTP schemas, import schemas, ImportStatus enum, reason code enums, domain event types

### Backend (0 blocking tasks)
- Backend is 98%+ complete. All API endpoints, use cases, and workers are implemented. No code changes needed — backend verification passed in prior audit.

### Web Frontend (7 tasks)
- Financial batch selection UI, dashboard drill-down, status transition reason dropdowns, inspector workload, 2FA QR code, idempotency keys, CL_USER property create restriction

### PWA (4 tasks)
- Offline queue sync activation, HEIC image conversion, profile page, earnings page

---

## Dependency Graph

```
Shared Tasks (1-5) → independent, can all run in parallel
Web Tasks (6-12)   → Task 8 depends on Shared Task 3 (reason codes); rest independent
PWA Tasks (13-16)  → independent of shared/web; can run in parallel
Final Verification (Task 17) → depends on all prior tasks
```

---

## Task 1: Add TOTP Schemas to Shared Package

**Files:**
- Create: `packages/shared/src/schemas/totp.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/schemas/totp.test.ts`

**Context:** Backend `setup-totp.use-case.ts` returns `{ secret: string, qrUri: string }`. Web `TotpSetupCard.tsx` needs typed responses. These schemas formalize the contract.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/totp.test.ts
import { describe, it, expect } from 'vitest';
import { setupTotpResponseSchema, confirmTotpSchema } from './totp';

describe('setupTotpResponseSchema', () => {
  it('accepts valid TOTP setup response', () => {
    const result = setupTotpResponseSchema.safeParse({
      secret: 'JBSWY3DPEHPK3PXP',
      qrUri: 'otpauth://totp/Properfy:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Properfy',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing secret', () => {
    const result = setupTotpResponseSchema.safeParse({ qrUri: 'otpauth://...' });
    expect(result.success).toBe(false);
  });
});

describe('confirmTotpSchema', () => {
  it('accepts valid 6-digit code', () => {
    const result = confirmTotpSchema.safeParse({ code: '123456' });
    expect(result.success).toBe(true);
  });

  it('rejects non-6-digit code', () => {
    const result = confirmTotpSchema.safeParse({ code: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric code', () => {
    const result = confirmTotpSchema.safeParse({ code: 'abcdef' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/schemas/totp.test.ts`
Expected: FAIL — module `./totp` not found

- [ ] **Step 3: Write implementation**

```typescript
// packages/shared/src/schemas/totp.ts
import { z } from 'zod';

export const setupTotpResponseSchema = z.object({
  secret: z.string().min(1),
  qrUri: z.string().min(1),
});
export type SetupTotpResponse = z.infer<typeof setupTotpResponseSchema>;

export const confirmTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Must be a 6-digit code'),
});
export type ConfirmTotpInput = z.infer<typeof confirmTotpSchema>;
```

- [ ] **Step 4: Add barrel export**

Add `export * from './totp';` to `packages/shared/src/schemas/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/schemas/totp.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/totp.ts packages/shared/src/schemas/totp.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add TOTP setup/confirm schemas"
```

---

## Task 2: Add ImportStatus Enum to Shared Package

**Files:**
- Create: `packages/shared/src/enums/import.ts`
- Modify: `packages/shared/src/enums/index.ts`
- Create: `packages/shared/src/enums/import.test.ts`

**Context:** Backend has import entities (`appointment-import.entity.ts`, `property-import.entity.ts`) with `status: string`. This formalizes the allowed values as an enum.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/enums/import.test.ts
import { describe, it, expect } from 'vitest';
import { ImportStatus } from './import';

describe('ImportStatus', () => {
  it('has all required statuses', () => {
    expect(ImportStatus.PENDING).toBe('PENDING');
    expect(ImportStatus.PROCESSING).toBe('PROCESSING');
    expect(ImportStatus.COMPLETED).toBe('COMPLETED');
    expect(ImportStatus.FAILED).toBe('FAILED');
  });

  it('has exactly 4 values', () => {
    expect(Object.keys(ImportStatus)).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/enums/import.test.ts`

- [ ] **Step 3: Write implementation**

```typescript
// packages/shared/src/enums/import.ts
export const ImportStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type ImportStatus = typeof ImportStatus[keyof typeof ImportStatus];
```

- [ ] **Step 4: Add barrel export**

Add `export * from './import';` to `packages/shared/src/enums/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/enums/import.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/enums/import.ts packages/shared/src/enums/import.test.ts packages/shared/src/enums/index.ts
git commit -m "feat(shared): add ImportStatus enum"
```

---

## Task 3: Add Cancellation/Rejection Reason Code Enums

**Files:**
- Create: `packages/shared/src/enums/reason-codes.ts`
- Modify: `packages/shared/src/enums/index.ts`
- Create: `packages/shared/src/enums/reason-codes.test.ts`

**Context:** Backend stores `cancellationReasonCode` and `rejectionReasonCode` as free-form strings (`z.string().max(50).optional()` in `statusTransitionSchema`). Web `StatusTransitionDialog` needs predefined options for dropdowns.

**Pre-implementation:** Read these files to determine the canonical reason codes:
- `apps/backend/prisma/migrations/20260317210000_add_reason_codes/migration.sql`
- `projeto-consolidado/regras-negocio-respostas-cliente.md`

The values below are likely correct but MUST be verified against those files. Update the test and implementation to match.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/enums/reason-codes.test.ts
import { describe, it, expect } from 'vitest';
import { CancellationReasonCode, RejectionReasonCode } from './reason-codes';

describe('CancellationReasonCode', () => {
  it('has expected codes', () => {
    expect(CancellationReasonCode.CLIENT_REQUEST).toBe('CLIENT_REQUEST');
    expect(CancellationReasonCode.TENANT_UNAVAILABLE).toBe('TENANT_UNAVAILABLE');
    expect(CancellationReasonCode.DUPLICATE).toBe('DUPLICATE');
    expect(CancellationReasonCode.SCHEDULING_CONFLICT).toBe('SCHEDULING_CONFLICT');
    expect(CancellationReasonCode.OTHER).toBe('OTHER');
  });

  it('has at least 3 codes', () => {
    expect(Object.keys(CancellationReasonCode).length).toBeGreaterThanOrEqual(3);
  });
});

describe('RejectionReasonCode', () => {
  it('has expected codes', () => {
    expect(RejectionReasonCode.INVALID_ADDRESS).toBe('INVALID_ADDRESS');
    expect(RejectionReasonCode.ACCESS_DENIED).toBe('ACCESS_DENIED');
    expect(RejectionReasonCode.UNSAFE_PROPERTY).toBe('UNSAFE_PROPERTY');
    expect(RejectionReasonCode.INCOMPLETE_DATA).toBe('INCOMPLETE_DATA');
    expect(RejectionReasonCode.OTHER).toBe('OTHER');
  });

  it('has at least 3 codes', () => {
    expect(Object.keys(RejectionReasonCode).length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/enums/reason-codes.test.ts`

- [ ] **Step 3: Write implementation**

```typescript
// packages/shared/src/enums/reason-codes.ts
export const CancellationReasonCode = {
  CLIENT_REQUEST: 'CLIENT_REQUEST',
  TENANT_UNAVAILABLE: 'TENANT_UNAVAILABLE',
  DUPLICATE: 'DUPLICATE',
  SCHEDULING_CONFLICT: 'SCHEDULING_CONFLICT',
  OTHER: 'OTHER',
} as const;
export type CancellationReasonCode = typeof CancellationReasonCode[keyof typeof CancellationReasonCode];

export const RejectionReasonCode = {
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  ACCESS_DENIED: 'ACCESS_DENIED',
  UNSAFE_PROPERTY: 'UNSAFE_PROPERTY',
  INCOMPLETE_DATA: 'INCOMPLETE_DATA',
  OTHER: 'OTHER',
} as const;
export type RejectionReasonCode = typeof RejectionReasonCode[keyof typeof RejectionReasonCode];
```

- [ ] **Step 4: Add barrel export and run tests**

Add `export * from './reason-codes';` to `packages/shared/src/enums/index.ts`.

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/enums/reason-codes.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums/reason-codes.ts packages/shared/src/enums/reason-codes.test.ts packages/shared/src/enums/index.ts
git commit -m "feat(shared): add cancellation and rejection reason code enums"
```

---

## Task 4: Add Import Schemas to Shared Package

**Files:**
- Create: `packages/shared/src/schemas/import.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Create: `packages/shared/src/schemas/import.test.ts`

**Context:** Backend `AppointmentImportEntity` has fields: `id`, `tenantId`, `status`, `fileKey`, `originalFilename`, `totalRows`, `successCount`, `errorCount`, `errorsJson`, `createdByUserId`, `createdAt`, `updatedAt`. No `processedRows` field. Web needs typed responses for polling import status.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/import.test.ts
import { describe, it, expect } from 'vitest';
import { importStatusResponseSchema } from './import';

describe('importStatusResponseSchema', () => {
  it('accepts valid import status response', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'COMPLETED',
      totalRows: 50,
      successCount: 48,
      errorCount: 2,
      errors: [
        { row: 5, field: 'email', message: 'Invalid email format' },
        { row: 12, field: 'postcode', message: 'Required field' },
      ],
      createdAt: '2026-03-18T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts response without errors array', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'PROCESSING',
      totalRows: 100,
      successCount: 0,
      errorCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = importStatusResponseSchema.safeParse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      status: 'INVALID',
      totalRows: 0,
      successCount: 0,
      errorCount: 0,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/schemas/import.test.ts`

- [ ] **Step 3: Write implementation**

```typescript
// packages/shared/src/schemas/import.ts
import { z } from 'zod';
import { ImportStatus } from '../enums/import';

export const importErrorSchema = z.object({
  row: z.number().int().positive(),
  field: z.string().optional(),
  message: z.string(),
});
export type ImportError = z.infer<typeof importErrorSchema>;

export const importStatusResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.nativeEnum(ImportStatus),
  totalRows: z.number().int().min(0),
  successCount: z.number().int().min(0),
  errorCount: z.number().int().min(0),
  errors: z.array(importErrorSchema).optional().nullable(),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional().nullable(),
});
export type ImportStatusResponse = z.infer<typeof importStatusResponseSchema>;
```

- [ ] **Step 4: Add barrel export and run tests**

Add `export * from './import';` to `packages/shared/src/schemas/index.ts`.

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/schemas/import.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/import.ts packages/shared/src/schemas/import.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add import status response schemas"
```

---

## Task 5: Add Domain Event Types to Shared Package

**Files:**
- Create: `packages/shared/src/types/events.ts`
- Create: `packages/shared/src/types/events.test.ts`
- Modify: `packages/shared/src/types/index.ts`

**Context:** Backend workers handle domain events (appointment status changed → billing, notifications). These type definitions formalize the event payloads for type safety.

**Pre-implementation:** Read `apps/backend/src/main/workers.ts` and `apps/backend/src/modules/billing/application/use-cases/create-financial-entries-on-done.use-case.ts` to confirm actual event payload shapes.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/types/events.test.ts
import { describe, it, expect } from 'vitest';
import type {
  DomainEvent,
  AppointmentStatusChangedPayload,
  ServiceGroupAcceptedPayload,
  NotificationFailedPayload,
  FinancialEntriesCreatedPayload,
} from './events';

describe('DomainEvent types', () => {
  it('can construct a valid DomainEvent', () => {
    const event: DomainEvent<AppointmentStatusChangedPayload> = {
      type: 'appointment.status_changed',
      payload: {
        appointmentId: '123',
        previousStatus: 'SCHEDULED',
        newStatus: 'DONE',
      },
      occurredAt: new Date().toISOString(),
    };
    expect(event.type).toBe('appointment.status_changed');
    expect(event.payload.appointmentId).toBe('123');
  });

  it('can construct ServiceGroupAcceptedPayload', () => {
    const payload: ServiceGroupAcceptedPayload = {
      serviceGroupId: 'sg-1',
      inspectorId: 'insp-1',
      appointmentIds: ['apt-1', 'apt-2'],
    };
    expect(payload.appointmentIds).toHaveLength(2);
  });

  it('can construct NotificationFailedPayload', () => {
    const payload: NotificationFailedPayload = {
      notificationId: 'n-1',
      channel: 'EMAIL',
      errorMessage: 'Provider timeout',
      retryCount: 3,
    };
    expect(payload.retryCount).toBe(3);
  });

  it('can construct FinancialEntriesCreatedPayload', () => {
    const payload: FinancialEntriesCreatedPayload = {
      appointmentId: 'apt-1',
      entries: [{ id: 'fe-1', type: 'TENANT_DEBIT', amount: 150 }],
    };
    expect(payload.entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/types/events.test.ts`
Expected: FAIL — module `./events` not found

- [ ] **Step 3: Write implementation**

```typescript
// packages/shared/src/types/events.ts
export interface DomainEvent<T = unknown> {
  type: string;
  payload: T;
  occurredAt: string;
  actorId?: string;
  tenantId?: string;
}

export interface AppointmentStatusChangedPayload {
  appointmentId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

export interface ServiceGroupAcceptedPayload {
  serviceGroupId: string;
  inspectorId: string;
  appointmentIds: string[];
}

export interface NotificationFailedPayload {
  notificationId: string;
  channel: string;
  errorMessage: string;
  retryCount: number;
}

export interface FinancialEntriesCreatedPayload {
  appointmentId: string;
  entries: Array<{ id: string; type: string; amount: number }>;
}
```

- [ ] **Step 4: Add barrel export**

Add `export * from './events';` to `packages/shared/src/types/index.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared test -- src/types/events.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/events.ts packages/shared/src/types/events.test.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): add domain event type definitions"
```

---

## Task 6: Web — Add Checkbox Selection to Financial Table

**Files:**
- Modify: `apps/web/src/features/financial/components/FinancialTable.tsx`
- Modify: `apps/web/src/features/financial/pages/FinancialEntriesPage.tsx`

**Context:** The batch approve hook (`useFinancialBatchApprove.ts`) and batch actions bar (`FinancialBatchActions.tsx`) already exist. What's missing is checkbox selection state and the checkbox column in `FinancialTable`. The batch actions bar expects `selectedIds`, `onClearSelection`, and `onApproveComplete` props.

- [ ] **Step 1: Read current FinancialTable and FinancialEntriesPage**

Read:
- `apps/web/src/features/financial/components/FinancialTable.tsx` — understand column structure
- `apps/web/src/features/financial/pages/FinancialEntriesPage.tsx` — understand how table is rendered
- `apps/web/src/features/financial/components/FinancialBatchActions.tsx` — already built, needs wiring

- [ ] **Step 2: Add selection state to FinancialEntriesPage**

Add `useState<Set<string>>` for selected entry IDs. Pass selection props to `FinancialTable` and wire `FinancialBatchActions`.

```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const toggleSelection = (id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const pendingIds = entries.filter((e) => e.status === 'PENDING').map((e) => e.id);
const selectAllPending = () => setSelectedIds(new Set(pendingIds));
const clearSelection = () => setSelectedIds(new Set());
```

- [ ] **Step 3: Add checkbox column to FinancialTable**

Add props to FinancialTable: `selectedIds: Set<string>`, `onToggleSelect: (id: string) => void`, `onSelectAll: () => void`.

Add a first column with:
- Header: checkbox that selects/deselects all PENDING entries on current page
- Cell: checkbox for each PENDING entry row; disabled for non-PENDING entries

- [ ] **Step 4: Wire FinancialBatchActions into page**

Below the table, render `<FinancialBatchActions>` with the selection state.

- [ ] **Step 5: Typecheck and run tests**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web typecheck && pnpm --filter web test -- src/features/financial/`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/financial/
git commit -m "feat(web): add checkbox selection to financial table for batch approve"
```

---

## Task 7: Web — Add Dashboard Stat Drill-Down Links

**Files:**
- Modify: `apps/web/src/features/dashboard/pages/DashboardPage.tsx`
- Modify: `apps/web/src/features/dashboard/components/DashboardSummaryCards.tsx` (or StatCard component)

**Context:** Dashboard stat cards show counts but aren't clickable. Clicking should navigate to filtered appointment/financial lists.

- [ ] **Step 1: Read current dashboard implementation**

Read:
- `apps/web/src/features/dashboard/pages/DashboardPage.tsx`
- `apps/web/src/features/dashboard/components/DashboardSummaryCards.tsx`
- Identify the StatCard component and check if it supports `href` or `onClick`.

- [ ] **Step 2: Add link support to StatCard**

If StatCard doesn't support linking, add an optional `href?: string` prop. When present, wrap the card in a `<Link>` from react-router-dom. Add `cursor-pointer hover:shadow-md transition` styling.

- [ ] **Step 3: Wire stat cards to filtered URLs**

Pass `href` props to each stat card:
- "Appointments Today" → `/appointments?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` (today's date)
- "Pending Confirmations" → `/appointments?tenantConfirmationStatus=PENDING`
- Other stats → relevant filtered list URLs

- [ ] **Step 4: Typecheck**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/dashboard/ apps/web/src/components/
git commit -m "feat(web): add drill-down links from dashboard stat cards"
```

---

## Task 8: Web — Add Reason Code Dropdowns to StatusTransitionDialog

**Files:**
- Modify: `apps/web/src/features/appointments/components/StatusTransitionDialog.tsx`

**Context:** StatusTransitionDialog currently has a free-text Textarea. Spec requires predefined reason code dropdown PLUS optional free-text for "OTHER".

**Depends on:** Task 3 (reason code enums in shared package)

- [ ] **Step 1: Read current dialog**

Read `apps/web/src/features/appointments/components/StatusTransitionDialog.tsx`.

- [ ] **Step 2: Import reason code enums and add dropdown**

```typescript
import { CancellationReasonCode, RejectionReasonCode } from '@properfy/shared';
```

Add a `SelectInput` before the free-text area:
- When `targetStatus === 'CANCELLED'`: show CancellationReasonCode options as dropdown
- When `targetStatus === 'REJECTED'`: show RejectionReasonCode options as dropdown
- When selected code === `'OTHER'`: show free-text Textarea for custom reason
- When selected code !== `'OTHER'`: hide free-text (the code label IS the reason)
- When status doesn't require reason (e.g., DRAFT → AWAITING_INSPECTOR): show neither dropdown nor textarea

- [ ] **Step 3: Update the submit payload**

The `statusTransitionSchema` in shared already has `cancellationReasonCode` and `rejectionReasonCode` optional string fields. Send:
```typescript
{
  targetStatus,
  reason: selectedCode === 'OTHER' ? reasonText : undefined,
  cancellationReasonCode: targetStatus === 'CANCELLED' ? selectedCode : undefined,
  rejectionReasonCode: targetStatus === 'REJECTED' ? selectedCode : undefined,
}
```

- [ ] **Step 4: Typecheck and run tests**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web typecheck && pnpm --filter web test -- src/features/appointments/`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/appointments/components/StatusTransitionDialog*
git commit -m "feat(web): add reason code dropdowns to status transition dialog"
```

---

## Task 9: Web — Add Inspector Workload to Detail Drawer

**Files:**
- Modify: `apps/web/src/features/inspectors/components/InspectorDetailSections.tsx`

**Context:** Inspector detail drawer shows personal info but no appointment workload counts.

- [ ] **Step 1: Read current implementation**

Read:
- `apps/web/src/features/inspectors/components/InspectorDetailSections.tsx`
- `apps/web/src/features/inspectors/hooks/useInspectorDetail.ts`
- Check backend response: `apps/backend/src/modules/inspector/interfaces/inspector.routes.ts` for what the GET detail endpoint returns. If it includes appointment counts, use them. If not, query the appointments API filtered by inspector.

- [ ] **Step 2: Add workload section**

If backend returns counts directly, display them. If not, add a secondary `useQuery` to count appointments for this inspector (e.g., `GET /v1/appointments?inspectorId=X&status=SCHEDULED&pageSize=0` to get total count from pagination metadata).

Add to InspectorDetailSections a new section:
```tsx
<DetailSection title="Workload">
  <DetailField label="Scheduled" value={`${scheduledCount} upcoming`} />
  <DetailField label="This Week" value={`${weekCount} appointments`} />
</DetailSection>
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/inspectors/
git commit -m "feat(web): add inspector workload section to detail drawer"
```

---

## Task 10: Web — Add QR Code to 2FA Setup

**Files:**
- Modify: `apps/web/src/features/settings/components/TotpSetupCard.tsx`
- Modify: `apps/web/package.json` (add `qrcode` dependency)

**Context:** TotpSetupCard displays TOTP URI and secret as text, but no QR code. Backend returns `{ secret, qrUri }` where `qrUri` is an `otpauth://` URI. QR code must be generated client-side from the URI.

- [ ] **Step 1: Read current TotpSetupCard**

Read `apps/web/src/features/settings/components/TotpSetupCard.tsx` to understand the current setup flow and where the `qrUri` is available.

- [ ] **Step 2: Install qrcode package**

```bash
cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web add qrcode && pnpm --filter web add -D @types/qrcode
```

- [ ] **Step 3: Generate QR code from otpauth URI**

In TotpSetupCard, add QR code generation using the `qrUri` returned by the backend:

```tsx
import QRCode from 'qrcode';
import { useState, useEffect } from 'react';

// In component, after receiving qrUri from setup API:
const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
useEffect(() => {
  if (qrUri) {
    QRCode.toDataURL(qrUri, { width: 200, margin: 2 }).then(setQrDataUrl);
  }
}, [qrUri]);

// In JSX, replace or augment the text display:
{qrDataUrl && (
  <div className="flex flex-col items-center gap-2">
    <img src={qrDataUrl} alt="Scan with authenticator app" className="rounded" />
    <p className="text-xs text-text-muted">Scan this QR code with your authenticator app</p>
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/settings/components/TotpSetupCard.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add QR code to TOTP setup card"
```

---

## Task 11: Web — Add Idempotency Keys to Critical Mutations

**Files:**
- Modify: `apps/web/src/features/financial/hooks/useCreateAdjustment.ts`
- Modify: `apps/web/src/features/financial/hooks/useCreateRefund.ts` (find the actual refund hook)
- Modify: `apps/web/src/features/appointments/hooks/useStatusTransition.ts` (or wherever status transitions are triggered)

**Context:** Idempotency keys are already used in appointment import, property import, and marketplace accept. They're missing from financial mutations and status transitions.

- [ ] **Step 1: Identify existing pattern**

Read an existing implementation, e.g. `apps/web/src/features/marketplace/hooks/useOfferAccept.ts`, to see how `Idempotency-Key` headers are generated and sent.

- [ ] **Step 2: Add idempotency to financial mutation hooks**

For each financial mutation hook, add `'Idempotency-Key': crypto.randomUUID()` to the request headers. The key must be generated per API call (not per component mount).

- [ ] **Step 3: Add idempotency to status transition hook**

Find the hook that calls `POST /v1/appointments/:id/status-transitions` and add the header.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/financial/ apps/web/src/features/appointments/
git commit -m "feat(web): add idempotency keys to financial and status transition mutations"
```

---

## Task 12: Web — Add CL_USER Create Restriction to Property List

**Files:**
- Modify: `apps/web/src/features/properties/pages/PropertyListPage.tsx`

**Context:** Appointment list already hides "New" button for CL_USER (done in prior audit). Property list should follow the same pattern.

- [ ] **Step 1: Read PropertyListPage and check if already gated**

Read `apps/web/src/features/properties/pages/PropertyListPage.tsx`.

- [ ] **Step 2: Add role check if missing**

Follow the same pattern used in `AppointmentListPage`:
```tsx
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@properfy/shared';

const { user } = useAuth();
const canCreate = user && [UserRole.AM, UserRole.OP, UserRole.CL_ADMIN].includes(user.role as any);

// In JSX, wrap the create button:
{canCreate && <Button ...>New Property</Button>}
```

- [ ] **Step 3: Typecheck**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter web typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/properties/pages/PropertyListPage.tsx
git commit -m "feat(web): hide create button from CL_USER on property list"
```

---

## Task 13: PWA — Activate Offline Queue Sync

**Files:**
- Modify: `apps/pwa/src/app/App.tsx`

**Context:** `useOfflineQueue()` hook at `apps/pwa/src/features/execution/hooks/useOfflineQueue.ts` is fully implemented — it listens for `isOnline` changes and processes queued actions. Both `useStartInspection` and `useFinishInspection` enqueue actions when offline. However, `useOfflineQueue()` is **never called from any component** — it's dead code. It must be activated at the app root level.

- [ ] **Step 1: Read App.tsx**

Read `apps/pwa/src/app/App.tsx` to understand the provider tree structure.

- [ ] **Step 2: Add a sync component to the app shell**

Create a tiny component that activates the hook and render it inside the app's authenticated area:

```tsx
import { useOfflineQueue } from '@/features/execution/hooks/useOfflineQueue';

function OfflineQueueSync() {
  useOfflineQueue();
  return null;
}
```

Add `<OfflineQueueSync />` inside the provider tree in App.tsx, after the auth provider so the user context is available.

- [ ] **Step 3: Typecheck and run tests**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter pwa typecheck && pnpm --filter pwa test`

- [ ] **Step 4: Commit**

```bash
git add apps/pwa/src/app/App.tsx
git commit -m "feat(pwa): activate offline queue sync on reconnect"
```

---

## Task 14: PWA — Add HEIC Image Conversion

**Files:**
- Modify: `apps/pwa/src/features/execution/hooks/useImageCompression.ts`
- Modify: `apps/pwa/package.json`
- Create: `apps/pwa/src/types/heic2any.d.ts` (type declaration if needed)

**Context:** The compression hook at `useImageCompression.ts` detects HEIC files (lines 6-12) but passes them through unchanged. iOS users commonly capture HEIC photos that need conversion to JPEG.

- [ ] **Step 1: Install heic2any**

```bash
cd /Users/pedro/Code/GitHub/properfy && pnpm --filter pwa add heic2any
```

- [ ] **Step 2: Check for type declarations**

If `@types/heic2any` doesn't exist on npm, create a minimal declaration:

```typescript
// apps/pwa/src/types/heic2any.d.ts
declare module 'heic2any' {
  interface Options {
    blob: Blob;
    toType?: string;
    quality?: number;
  }
  export default function heic2any(options: Options): Promise<Blob | Blob[]>;
}
```

- [ ] **Step 3: Add HEIC conversion to compression hook**

Read `apps/pwa/src/features/execution/hooks/useImageCompression.ts`. In the `compressImage` function, add conversion before the canvas resize step:

```typescript
import heic2any from 'heic2any';

// At the point where isHeic is detected (lines 6-12), add:
if (isHeic(file)) {
  try {
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    file = new File([blob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), {
      type: 'image/jpeg',
    });
  } catch {
    // If conversion fails, proceed with original file — backend will handle or reject
    console.warn('HEIC conversion failed, uploading original');
  }
}
```

- [ ] **Step 4: Typecheck and run tests**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter pwa typecheck && pnpm --filter pwa test`

- [ ] **Step 5: Commit**

```bash
git add apps/pwa/src/features/execution/hooks/useImageCompression.ts apps/pwa/src/types/heic2any.d.ts apps/pwa/package.json pnpm-lock.yaml
git commit -m "feat(pwa): add HEIC to JPEG conversion for iOS photo uploads"
```

---

## Task 15: PWA — Implement Profile Page

**Files:**
- Create: `apps/pwa/src/features/profile/pages/ProfilePage.tsx`
- Create: `apps/pwa/src/features/profile/components/ProfileCard.tsx`
- Modify: `apps/pwa/src/app/router.tsx` (replace PlaceholderPage)

**Context:** Profile page is a "Coming soon" placeholder. Backend `GET /v1/auth/me` already returns user data. This implements a minimal but real profile page.

- [ ] **Step 1: Read current auth hook and router**

Read:
- `apps/pwa/src/app/router.tsx` — see how `/profile` route is defined
- `apps/pwa/src/hooks/useAuth.ts` or `apps/pwa/src/features/auth/` — see what user data is available (name, email, role)

- [ ] **Step 2: Create ProfileCard component**

```tsx
// apps/pwa/src/features/profile/components/ProfileCard.tsx
interface ProfileCardProps {
  name: string;
  email: string;
  role: string;
}

export function ProfileCard({ name, email, role }: ProfileCardProps) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-bold text-text-primary">{name}</h2>
          <p className="text-sm text-text-secondary">{email}</p>
          <span className="mt-1 inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {role}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ProfilePage**

```tsx
// apps/pwa/src/features/profile/pages/ProfilePage.tsx
import { useAuth } from '@/hooks/useAuth';
import { ProfileCard } from '../components/ProfileCard';
import { Button } from '@/components/ui/Button';

export function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold text-text-primary">Profile</h1>
      <ProfileCard name={user.name} email={user.email} role={user.role} />
      <div className="mt-4">
        <Button variant="secondary" onClick={logout} fullWidth>
          Log Out
        </Button>
      </div>
      <p className="text-center text-xs text-text-muted">Properfy Inspector v1.0</p>
    </div>
  );
}
```

- [ ] **Step 4: Wire into router**

In `apps/pwa/src/app/router.tsx`, replace the `PlaceholderPage` import for the `/profile` route with `ProfilePage`.

- [ ] **Step 5: Typecheck and run tests**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter pwa typecheck && pnpm --filter pwa test`

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/features/profile/ apps/pwa/src/app/router.tsx
git commit -m "feat(pwa): implement profile page with user info and logout"
```

---

## Task 16: PWA — Implement Earnings Page (Minimal)

**Files:**
- Create: `apps/pwa/src/features/earnings/pages/EarningsPage.tsx`
- Create: `apps/pwa/src/features/earnings/components/EarningsSummaryCard.tsx`
- Modify: `apps/pwa/src/app/router.tsx`

**Context:** Earnings page is a "Coming soon" placeholder.

- [ ] **Step 1: Check backend financial endpoint availability**

Read `apps/backend/src/modules/billing/interfaces/billing.routes.ts` to check if `GET /v1/financial-entries` supports filtering by `inspectorId` or if there's a dedicated inspector endpoint.

- [ ] **Step 2: Create EarningsSummaryCard**

```tsx
// apps/pwa/src/features/earnings/components/EarningsSummaryCard.tsx
interface EarningsSummaryCardProps {
  label: string;
  amount: string;
  subtitle?: string;
}

export function EarningsSummaryCard({ label, amount, subtitle }: EarningsSummaryCardProps) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text-primary">{amount}</p>
      {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create EarningsPage**

If a backend endpoint exists for inspector financial data, fetch and display it. If not, show a "Financial summary will be available soon" message with the summary card skeleton (better than "Coming soon").

- [ ] **Step 4: Wire into router**

Replace `PlaceholderPage` for `/earnings` in `apps/pwa/src/app/router.tsx`.

- [ ] **Step 5: Typecheck and run tests**

Run: `cd /Users/pedro/Code/GitHub/properfy && pnpm --filter pwa typecheck && pnpm --filter pwa test`

- [ ] **Step 6: Commit**

```bash
git add apps/pwa/src/features/earnings/ apps/pwa/src/app/router.tsx
git commit -m "feat(pwa): implement earnings page"
```

---

## Task 17: Final Verification

**Dependencies:** All prior tasks must be complete.

- [ ] **Step 1: Rebuild shared package**

```bash
cd /Users/pedro/Code/GitHub/properfy && pnpm --filter shared build
```

This regenerates types consumed by all apps.

- [ ] **Step 2: Typecheck all workspaces**

```bash
pnpm --filter shared typecheck
pnpm --filter backend typecheck
pnpm --filter web typecheck
pnpm --filter pwa typecheck
```

All must pass with zero errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm --filter shared test
pnpm --filter backend test
pnpm --filter web test
pnpm --filter pwa test
```

All must pass.

- [ ] **Step 4: Build all workspaces**

```bash
pnpm --filter shared build
pnpm --filter backend build
pnpm --filter web build
pnpm --filter pwa build
```

All must succeed.

- [ ] **Step 5: Lint**

```bash
pnpm lint
```

Fix any lint errors.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve lint and build issues from remaining features"
```

---

## Parallelization Guide

These task groups can run in parallel:

**Group A (Shared Package):** Tasks 1, 2, 3, 4, 5 — all independent
**Group B (Web — no dependency on shared):** Tasks 6, 7, 9, 10, 11, 12 — all independent
**Group C (PWA):** Tasks 13, 14, 15, 16 — all independent
**Sequential:** Task 8 after Task 3; Task 17 after all others

Maximum parallelism: 15 tasks across 3 groups, followed by Task 8, then Task 17.

---

## What's NOT in This Plan (Deferred)

These items were identified in the audit but are **not blocking production** and are explicitly deferred:

1. **PWA Map page** — Requires Mapbox route visualization API, no backend endpoint for route calculation
2. **Dashboard charts/analytics** — Stat cards are sufficient for launch; charts are P2
3. **Responsive design testing** — Requires device testing, not code changes
4. **Notification webhook signature verification** — Security hardening, not functionality
5. **WhatsApp full wiring** — Zenvia provider exists but channel not launched yet
6. **Inline property creation from appointment form** — Users can create property first, then appointment
7. **Financial GenerateInvoice modal live preview** — Modal exists and works; live preview is P2 polish
8. **Empty state illustrations** — Current generic empty states are functional; custom illustrations are P2
