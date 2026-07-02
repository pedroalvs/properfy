import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useListQuery } from '@/hooks/useApiQuery';

export interface PayoutEntry {
  id: string;
  entryType: string;
  amount: number;
  currency: string;
  status: string;
  effectiveAt: string;
}

interface PaginatedPayouts {
  data: PayoutEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface UseInspectorEarningsResult {
  entries: PayoutEntry[];
  currency: string;
  /** All-time approved payouts — "Total earnings with Properfy". */
  totalApproved: number;
  /** Approved-but-not-yet-paid payouts — an estimate of the next payment. */
  nextPayment: number;
  isLoading: boolean;
  error: { message: string } | null;
}

/**
 * 031 — the inspector's own payouts (`INSPECTOR_PAYOUT`), all statuses, most
 * recent first. Totals are derived client-side; the date filter (in the page)
 * narrows the chart + history without refetching.
 */
export function useInspectorEarnings(): UseInspectorEarningsResult {
  const { user } = useAuth();
  const { data, isLoading, error } = useListQuery<PaginatedPayouts>(
    ['inspector-earnings', user?.id],
    '/v1/financial/entries',
    { type: 'INSPECTOR_PAYOUT', pageSize: '200', sortBy: 'effectiveAt', sortOrder: 'desc' },
    { enabled: !!user },
  );

  const entries = useMemo(() => data?.data ?? [], [data]);

  return useMemo(() => {
    const currency = entries[0]?.currency ?? 'AUD';
    const totalApproved = entries
      .filter((e) => e.status === 'APPROVED')
      .reduce((sum, e) => sum + e.amount, 0);
    const nextPayment = entries
      .filter((e) => e.status === 'PENDING')
      .reduce((sum, e) => sum + e.amount, 0);
    return { entries, currency, totalApproved, nextPayment, isLoading, error: error ?? null };
  }, [entries, isLoading, error]);
}
