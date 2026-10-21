import { useCreateMutation } from '@/hooks/useApiQuery';
import type { BulkEditAppointmentInput } from '@properfy/shared';

/** Matches the backend `BulkEditResult` from
 *  `apps/backend/src/modules/appointment/application/use-cases/bulk-edit-appointments.use-case.ts`. */
export interface BulkEditResult {
  updated: number;
  failed: Array<{ id: string; code: string; message: string }>;
}

/**
 * WEB-11 — typed bulk-edit mutation, co-located with the other bulk hooks.
 *
 * The backend `/v1/appointments/bulk-edit` route ships without a Fastify
 * response/body schema, so the generated OpenAPI type carries
 * `requestBody?: never`: the typed client cannot accept a body there. Routing
 * the call through the shared `useCreateMutation` generic wrapper keeps the one
 * unavoidable cast inside that wrapper while giving this hook a fully typed
 * boundary (`BulkEditAppointmentInput` in, `BulkEditResult` out) — replacing the
 * former `(api as any).POST(...)` at the call site.
 */
export function useBulkEdit() {
  return useCreateMutation<BulkEditAppointmentInput, BulkEditResult>(
    '/v1/appointments/bulk-edit',
    [['appointments'], ['appointments-map']],
  );
}
