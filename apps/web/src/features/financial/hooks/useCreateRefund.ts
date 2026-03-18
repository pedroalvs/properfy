import { useCreateMutation } from '@/hooks/useApiQuery';

export interface CreateRefundInput {
  appointmentId: string;
  amount: number;
  reason: string;
  effectiveAt: string;
}

export function useCreateRefund() {
  return useCreateMutation<CreateRefundInput>(
    '/v1/financial/entries',
    [['financial-entries'], ['financial-entries', 'summary']],
  );
}
