import { useCreateMutation } from '@/hooks/useApiQuery';
import { useSnackbar } from '@/hooks/useSnackbar';

interface ReportGenerateInput {
  reportType: string;
  filters?: Record<string, string>;
}

export interface UseReportGenerateReturn {
  generate: (input: ReportGenerateInput) => void;
  isGenerating: boolean;
}

export function useReportGenerate(): UseReportGenerateReturn {
  const { showSuccess, showError } = useSnackbar();

  const mutation = useCreateMutation<ReportGenerateInput>(
    '/v1/reports',
    [['reports']],
  );

  const generate = (input: ReportGenerateInput) => {
    mutation.mutate(input, {
      onSuccess: () => {
        showSuccess('Report generation started');
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
