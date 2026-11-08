import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ListPropertyIssuesResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { resolveFileErrorMessage } from '../lib/file-errors';

export interface UseDeletePropertyIssueReturn {
  remove: (issueId: string) => void;
  isDeleting: boolean;
  deletingId: string | undefined;
}

/**
 * Soft-delete an issue and its photos (AM/OP, F10). Optimistically removes it
 * from every cached `property-issues` list (prefix) with rollback on error; on
 * settle invalidates the issue + list prefixes so counts and the unseen-count
 * indicator re-sync.
 */
export function useDeletePropertyIssue(): UseDeletePropertyIssueReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const mutation = useMutation<void, Error, string, { prev: [readonly unknown[], unknown][] }>({
    mutationFn: async (issueId: string) => {
      const { error, response } = await api.DELETE('/v1/property-issues/{id}', {
        params: { path: { id: issueId } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
    },
    onMutate: async (issueId) => {
      await queryClient.cancelQueries({ queryKey: ['property-issues'] });
      const prev = queryClient.getQueriesData({ queryKey: ['property-issues'] });
      queryClient.setQueriesData<ListPropertyIssuesResponse>(
        { queryKey: ['property-issues'] },
        (old) => (old ? { ...old, issues: old.issues.filter((i) => i.id !== issueId) } : old),
      );
      return { prev };
    },
    onError: (err, _issueId, ctx) => {
      ctx?.prev.forEach(([key, data]) => queryClient.setQueryData(key, data));
      showError(resolveFileErrorMessage(err, 'Could not delete the issue'));
    },
    onSuccess: () => showSuccess('Issue deleted'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['property-issues'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });

  return {
    remove: (issueId: string) => mutation.mutate(issueId),
    isDeleting: mutation.isPending,
    deletingId: mutation.isPending ? mutation.variables : undefined,
  };
}
