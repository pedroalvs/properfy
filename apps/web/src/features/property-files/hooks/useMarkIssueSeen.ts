import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MarkPropertyIssueSeenResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { resolveFileErrorMessage } from '../lib/file-errors';

export interface UseMarkIssueSeenReturn {
  markSeen: (issueId: string) => void;
  markingId: string | undefined;
}

/**
 * Mark an issue as seen (AM/OP/CL_ADMIN, F10). The backend is a CAS — a second,
 * concurrent click returns `{ alreadySeen: true }` without error (D23). Success
 * invalidates the `property-issues` prefix (which covers the issue lists AND the
 * `['property-issues','unseen-count']` key, clearing the indicators) plus the two
 * list prefixes (row borders).
 */
export function useMarkIssueSeen(): UseMarkIssueSeenReturn {
  const queryClient = useQueryClient();
  const { showError } = useSnackbar();

  const mutation = useMutation<MarkPropertyIssueSeenResponse, Error, string>({
    mutationFn: async (issueId: string) => {
      const { data, error, response } = await api.POST('/v1/property-issues/{id}/seen', {
        params: { path: { id: issueId } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
      return (data as { data: MarkPropertyIssueSeenResponse }).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-issues'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
    onError: (err) => showError(resolveFileErrorMessage(err, 'Could not mark as seen')),
  });

  return {
    markSeen: (issueId: string) => mutation.mutate(issueId),
    markingId: mutation.isPending ? mutation.variables : undefined,
  };
}
