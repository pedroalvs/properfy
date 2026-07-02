import { useCreateMutation } from '@/hooks/useApiQuery';

export interface GenerateInvoiceInput {
  inspectorId: string;
  periodStart: string;
  periodEnd: string;
  periodType?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
}

export function useGenerateInvoice() {
  return useCreateMutation<GenerateInvoiceInput>(
    '/v1/billing/invoices/generate',
    [['invoices']],
  );
}
