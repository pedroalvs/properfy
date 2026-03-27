import { useAuth } from '@/hooks/useAuth';
import { useListQuery } from '@/hooks/useApiQuery';
import { EarningsSummaryCard } from '../components/EarningsSummaryCard';
import { formatDate } from '@/lib/format-date';
import { TopBar } from '@/components/shell/TopBar';

interface FinancialEntry {
  id: string;
  entryType: string;
  amount: number;
  currency: string;
  status: string;
  effectiveAt: string;
}

interface PaginatedResponse {
  data: FinancialEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(amount);
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
  const primaryCurrency = entries[0]?.currency ?? 'AUD';
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
    <div className="w-full">
      <TopBar title="Earnings" />
      <div className="flex flex-col gap-4 p-4">
      <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(22,163,74,0.96),_rgba(34,197,94,0.78))] px-5 py-5 text-white shadow-[0_18px_44px_rgba(22,163,74,0.18)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Approved payouts</p>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{formatCurrency(totalEarnings, primaryCurrency)}</h1>
        <p className="mt-1 text-sm text-white/80">
          {entries.length} payment{entries.length === 1 ? '' : 's'} processed for your account
        </p>
      </section>

      {isLoading && (
        <div className="flex flex-col gap-3">
          <div className="h-24 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-24 animate-pulse rounded-lg bg-gray-200" />
        </div>
      )}

      {error && (
        <div className="rounded-[24px] bg-white p-6 text-center shadow-sm">
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
            amount={formatCurrency(thisMonthTotal, primaryCurrency)}
            subtitle={`${thisMonthEntries.length} payments`}
          />
          <EarningsSummaryCard
            label="Total Earnings"
            amount={formatCurrency(totalEarnings, primaryCurrency)}
            subtitle={`${entries.length} payments total`}
          />

          {entries.length === 0 && (
            <div className="rounded-[24px] bg-white p-6 text-center shadow-sm">
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
                <div key={entry.id} className="flex items-center justify-between rounded-[20px] border border-white/70 bg-white/92 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {formatCurrency(entry.amount, entry.currency)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatDate(entry.effectiveAt)}
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
    </div>
  );
}
