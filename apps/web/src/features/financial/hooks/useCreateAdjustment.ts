import { useCreateMutation } from '@/hooks/useApiQuery';

export interface CreateAdjustmentInput {
  amount: number;
  effectiveAt: string;
  notes: string;
  entryType: string;
}

export function useCreateAdjustment() {
  return useCreateMutation<CreateAdjustmentInput>(
    '/v1/financial/entries',
    [['financial-entries'], ['financial-entries', 'summary']],
  );
}
