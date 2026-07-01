import type { RequestReportInput } from '@properfy/shared';
import { useCreateMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

export interface UseReportGenerateReturn {
  generate: (input: RequestReportInput, options?: { onSuccess?: () => void }) => void;
  isGenerating: boolean;
}

export function useReportGenerate(): UseReportGenerateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useCreateMutation<RequestReportInput>(
    '/v1/reports',
    [['reports']],
  );

  const generate = (input: RequestReportInput, options?: { onSuccess?: () => void }) => {
    mutation.mutate(input, {
      onSuccess: () => {
        showSuccess('Report generation started');
        options?.onSuccess?.();
      },
      onError: (err) => {
        showError(err.message || 'Failed to generate report');
      },
    });
  };

  return {
    generate,
    isGenerating: mutation.isPending,
  };
}
