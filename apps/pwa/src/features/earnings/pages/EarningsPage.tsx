import { useAuth } from '@/hooks/useAuth';
import { useListQuery } from '@/hooks/useApiQuery';
import { EarningsSummaryCard } from '../components/EarningsSummaryCard';

interface FinancialEntry {
  id: string;
  type: string;
  amount: number;
  status: string;
  effectiveAt: string;
}

interface PaginatedResponse {
  data: FinancialEntry[];
  total: number;
  page: number;
  pageSize: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

export function EarningsPage() {
  const { user } = useAuth();

  const { data, isLoading, error } = useListQuery<PaginatedResponse>(
    ['earnings', user?.id],
    '/v1/financial/entries',
    {
      type: 'INSPECTOR_PAYOUT',
      status: 'APPROVED',
      pageSize: '100',
      sortBy: 'effectiveAt',
      sortOrder: 'desc',
    },
    { enabled: !!user },
  );

  const entries = data?.data ?? [];
  const totalEarnings = entries.reduce((sum, e) => sum + e.amount, 0);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const thisMonthEntries = entries.filter((e) => {
    const d = new Date(e.effectiveAt);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const thisMonthTotal = thisMonthEntries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold text-text-primary">Earnings</h1>

      {isLoading && (
        <div className="flex flex-col gap-3">
          <div className="h-24 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-24 animate-pulse rounded-lg bg-gray-200" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-white p-6 text-center shadow-sm">
          <i className="mdi mdi-cash-multiple text-[48px] text-text-muted" aria-hidden="true" />
          <p className="mt-4 text-base font-semibold text-text-primary">Financial summary</p>
          <p className="mt-1 text-sm text-text-secondary">
            Unable to load earnings at this time. Please try again later.
          </p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <EarningsSummaryCard
            label="This Month"
            amount={formatCurrency(thisMonthTotal)}
            subtitle={`${thisMonthEntries.length} payments`}
          />
          <EarningsSummaryCard
            label="Total Earnings"
            amount={formatCurrency(totalEarnings)}
            subtitle={`${entries.length} payments total`}
          />

          {entries.length === 0 && (
            <div className="rounded-lg bg-white p-6 text-center shadow-sm">
              <i className="mdi mdi-cash-multiple text-[48px] text-text-muted" aria-hidden="true" />
              <p className="mt-4 text-sm text-text-secondary">
                No earnings recorded yet. Complete inspections to start earning.
              </p>
            </div>
          )}

          {entries.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-text-secondary">Recent Payments</h2>
              {entries.slice(0, 10).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {formatCurrency(entry.amount)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {new Date(entry.effectiveAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                    Approved
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
