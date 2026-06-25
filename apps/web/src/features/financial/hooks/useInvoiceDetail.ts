import { useDetailQuery } from '@/hooks/useApiQuery';
import type { InvoiceDetail } from '../types';

export interface UseInvoiceDetailReturn {
  invoice: InvoiceDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useInvoiceDetail(id: string | null): UseInvoiceDetailReturn {
  const query = useDetailQuery<InvoiceDetail>(
    ['invoices', id],
    `/v1/billing/invoices/${id}`,
    { enabled: !!id },
  );

  return {
    invoice: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
