import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ListPropertyFilesResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { toApiError } from '@/lib/api-error';
import { useSnackbar } from '@/hooks/useSnackbar';
import { resolveFileErrorMessage } from '../lib/file-errors';

export interface UseDeletePropertyFileReturn {
  remove: (fileId: string) => void;
  isDeleting: boolean;
  deletingId: string | undefined;
}

/**
 * Soft-delete a file (AM/OP, F10). Optimistically removes it from every cached
 * `property-files` list (prefix match) and rolls back on error; on settle it
 * invalidates the file + list prefixes so counts re-sync.
 */
export function useDeletePropertyFile(): UseDeletePropertyFileReturn {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useSnackbar();

  const mutation = useMutation<
    void,
    Error,
    string,
    { prev: [readonly unknown[], unknown][] }
  >({
    mutationFn: async (fileId: string) => {
      const { error, response } = await api.DELETE('/v1/property-files/{id}', {
        params: { path: { id: fileId } },
      });
      if (error) throw toApiError(error, (response as Response | undefined)?.status);
    },
    onMutate: async (fileId) => {
      await queryClient.cancelQueries({ queryKey: ['property-files'] });
      const prev = queryClient.getQueriesData({ queryKey: ['property-files'] });
      // Array guard: every `['property-files', …]` entry is a {files,counts} list
      // today, but guard against a future non-list key sharing the prefix (cf. the
      // unseen-count collision fixed in useDeletePropertyIssue).
      queryClient.setQueriesData<ListPropertyFilesResponse>({ queryKey: ['property-files'] }, (old) =>
        old && Array.isArray(old.files) ? { ...old, files: old.files.filter((f) => f.id !== fileId) } : old,
      );
      return { prev };
    },
    onError: (err, _fileId, ctx) => {
      ctx?.prev.forEach(([key, data]) => queryClient.setQueryData(key, data));
      showError(resolveFileErrorMessage(err, 'Could not delete the file'));
    },
    onSuccess: () => showSuccess('File deleted'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['property-files'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });

  return {
    remove: (fileId: string) => mutation.mutate(fileId),
    isDeleting: mutation.isPending,
    deletingId: mutation.isPending ? mutation.variables : undefined,
  };
}
