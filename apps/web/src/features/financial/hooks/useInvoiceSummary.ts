import { useQuery } from '@tanstack/react-query';
import type { InvoiceSummaryResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { MultiCurrencyScopeError } from '../types';

export interface InvoiceSummaryParams {
  inspectorId?: string;
  agencyId?: string;
  branchId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface UseInvoiceSummaryReturn {
  summary: InvoiceSummaryResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  multiCurrencyError: MultiCurrencyScopeError | null;
  refetch: () => void;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: { currencies?: string[] };
  };
}

export function useInvoiceSummary(params: InvoiceSummaryParams): UseInvoiceSummaryReturn {
  // Empty-string filters (unset FilterSelect values) are omitted from the request.
  const queryParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => !!value),
  ) as Record<string, string>;

  const query = useQuery<{ data: InvoiceSummaryResponse }, ApiError>({
    queryKey: ['billing', 'invoice-summary', queryParams],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/billing/invoices/summary', {
        params: { query: queryParams },
      });
      if (error) {
        // Custom MULTI_CURRENCY_SCOPE detail shape not modelled by ApiError.
        const envelope = error as ApiErrorEnvelope;
        // The HTTP status lives on the raw Response; the parsed error body only has the envelope.
        const status = (response as Response | undefined)?.status ?? 500;
        const code = envelope.error?.code;
        const message = envelope.error?.message ?? 'Failed to load invoice summary';
        const details = envelope.error?.details;
        const apiError = new ApiError(status, message, code, undefined);
        if (code === 'MULTI_CURRENCY_SCOPE' && details?.currencies) {
          (apiError as ApiError & { currencies?: string[] }).currencies = details.currencies;
        }
        throw apiError;
      }
      return data as unknown as { data: InvoiceSummaryResponse };
    },
    retry: false,
  });

  let multiCurrencyError: MultiCurrencyScopeError | null = null;
  if (query.error?.code === 'MULTI_CURRENCY_SCOPE') {
    const currencies = (query.error as ApiError & { currencies?: string[] }).currencies ?? [];
    multiCurrencyError = {
      code: 'MULTI_CURRENCY_SCOPE',
      message: query.error.message,
      currencies,
    };
  }

  return {
    summary: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    multiCurrencyError,
    refetch: query.refetch,
  };
}
