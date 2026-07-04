import { useQuery } from '@tanstack/react-query';
import type { ReconciliationSummaryResponse } from '@properfy/shared';
import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import type { MultiCurrencyScopeError } from '../types';

// Re-exported for existing consumers; the canonical definition lives in ../types.
export type { MultiCurrencyScopeError };

export interface ReconciliationSummaryParams {
  from: string;
  to: string;
  inspectorId?: string;
  enabled?: boolean;
}

export interface UseReconciliationSummaryReturn {
  summary: ReconciliationSummaryResponse | null;
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

export function useReconciliationSummary({
  from,
  to,
  inspectorId,
  enabled = true,
}: ReconciliationSummaryParams): UseReconciliationSummaryReturn {
  const query = useQuery<{ data: ReconciliationSummaryResponse }, ApiError>({
    queryKey: ['billing', 'reconciliation-summary', { from, to, inspectorId: inspectorId ?? null }],
    queryFn: async () => {
      const params = inspectorId ? { from, to, inspectorId } : { from, to };
      // The `as never` path cast collapses the result type, so re-assert the openapi-fetch shape.
      const { data, error, response } = (await api.GET(
        '/v1/billing/invoices/reconciliation-summary' as never,
        { params: { query: params } } as never,
      )) as { data?: unknown; error?: unknown; response?: Response };
      if (error) {
        const envelope = error as ApiErrorEnvelope;
        // The HTTP status lives on the raw Response; the parsed error body only has the envelope.
        const status = response?.status ?? 500;
        const code = envelope.error?.code;
        const message = envelope.error?.message ?? 'Failed to load reconciliation summary';
        const details = envelope.error?.details;
        const apiError = new ApiError(status, message, code, undefined);
        // Attach currencies for multi-currency scope handling
        if (code === 'MULTI_CURRENCY_SCOPE' && details?.currencies) {
          (apiError as ApiError & { currencies?: string[] }).currencies = details.currencies;
        }
        throw apiError;
      }
      return data as { data: ReconciliationSummaryResponse };
    },
    enabled: enabled && !!from && !!to,
    retry: false,
  });

  let multiCurrencyError: MultiCurrencyScopeError | null = null;
  if (query.error?.code === 'MULTI_CURRENCY_SCOPE') {
    const currencies =
      (query.error as ApiError & { currencies?: string[] }).currencies ?? [];
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
