import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePropertyIssueInput, PropertyIssueResponse } from '@properfy/shared';
import { apiPost, type SuccessResponse } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { propertyFilesKey } from './usePropertyFiles';
import { propertyIssuesKey } from './usePropertyIssues';

export interface CreatePropertyIssueArgs {
  body: CreatePropertyIssueInput;
  idempotencyKey: string;
}

/**
 * Create an issue (optionally linking already-confirmed photos). The create is
 * idempotent via `Idempotency-Key` (D24); the backend forces `source='INSPECTOR'`
 * and flips the linked photos PENDING→READY atomically (a partial link is a 409).
 * On success it invalidates the appointment's file/issue lists and the detail
 * (so counts + the Issues list refresh — FR-014).
 */
export function useCreatePropertyIssue(appointmentId: string) {
  const queryClient = useQueryClient();

  return useMutation<PropertyIssueResponse, ApiError, CreatePropertyIssueArgs>({
    mutationFn: async ({ body, idempotencyKey }) => {
      const res = await apiPost<SuccessResponse<PropertyIssueResponse>>('/v1/property-issues', body, {
        'Idempotency-Key': idempotencyKey,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: propertyIssuesKey(appointmentId) });
      queryClient.invalidateQueries({ queryKey: propertyFilesKey(appointmentId) });
      queryClient.invalidateQueries({ queryKey: ['inspector', 'appointment', appointmentId] });
    },
  });
}
