import { useCreateMutation } from '@/hooks/useApiQuery';
import type { BulkAssignInspectorRequest, BulkActionResponse } from '@properfy/shared';

/**
 * 025 §FR-441 — bulk inspector assignment / reassignment from the
 * appointment map flow.
 */
export function useBulkAssignInspector() {
  return useCreateMutation<BulkAssignInspectorRequest, BulkActionResponse>(
    '/v1/appointments/bulk-assign-inspector',
    [['appointments-map'], ['appointments']],
  );
}
