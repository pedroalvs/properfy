import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { formatDate } from '@/lib/format-date';
import { useInspectorEarnings, type PayoutEntry } from '../hooks/useInspectorEarnings';
import { EarningsChart, type ChartBar } from '../components/EarningsChart';

type Segment = 'earnings' | 'history';

function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(amount);
}

/** Payment status chip for a payout entry. */
function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    APPROVED: { label: 'Approved', cls: 'bg-success/10 text-success' },
    PENDING: { label: 'Pending', cls: 'bg-warning/10 text-warning' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-error/10 text-error' },
    VOIDED: { label: 'Voided', cls: 'bg-gray-200 text-text-secondary' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-200 text-text-secondary' };
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

/** Build a last-N-months series of approved earnings for the chart. */
function buildMonthlySeries(entries: PayoutEntry[], months: number): ChartBar[] {
  const now = new Date();
  const buckets: ChartBar[] = [];
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.status !== 'APPROVED') continue;
    const d = new Date(e.effectiveAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    totals.set(key, (totals.get(key) ?? 0) + e.amount);
  }
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets.push({ label: d.toLocaleDateString('en-AU', { month: 'short' }), value: totals.get(key) ?? 0 });
  }
  return buckets;
}

export function EarningsPage() {
  const navigate = useNavigate();
  const { entries, currency, totalApproved, nextPayment, isLoading, error } = useInspectorEarnings();

  const [segment, setSegment] = useState<Segment>('earnings');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const day = e.effectiveAt.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [entries, fromDate, toDate]);

  const monthlyBars = useMemo(() => buildMonthlySeries(filtered, 6), [filtered]);

  const clearRange = useCallback(() => {
    setFromDate('');
    setToDate('');
  }, []);

  const dateFilter = (
    <div className="flex items-end gap-2 rounded-[20px] bg-white px-4 py-3 shadow-sm">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">From</span>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
          aria-label="From date"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">To</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
          aria-label="To date"
        />
      </label>
      {(fromDate || toDate) && (
        <button type="button" onClick={clearRange} className="pb-1.5 text-xs font-semibold text-primary" aria-label="Clear date filter">
          Clear
        </button>
      )}
    </div>
  );

  return (
    <div className="w-full">
      <TopBar title="Earnings" />
      <div className="flex flex-col gap-4 p-4">
        {/* Segmented control: Earnings | History */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1" role="tablist">
          {(['earnings', 'history'] as const).map((seg) => (
            <button
              key={seg}
              type="button"
              role="tab"
              aria-selected={segment === seg}
              onClick={() => setSegment(seg)}
              className={`rounded-full py-2 text-sm font-semibold capitalize transition-colors ${
                segment === seg ? 'bg-white text-secondary shadow-sm' : 'text-text-secondary'
              }`}
            >
              {seg}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-32 animate-pulse rounded-lg bg-gray-200" />
          </div>
        )}

        {error && (
          <div className="rounded-[24px] bg-white p-6 text-center shadow-sm">
            <i className="mdi mdi-cash-multiple text-[48px] text-text-muted" aria-hidden="true" />
            <p className="mt-4 text-sm text-text-secondary">
              {error.message || 'Unable to load earnings at this time. Please try again later.'}
            </p>
          </div>
        )}

        {!isLoading && !error && segment === 'earnings' && (
          <>
            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-white px-4 py-4 shadow-sm" data-testid="next-payment-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Next payment</p>
                <p className="mt-2 text-xl font-bold text-text-primary">{formatCurrency(nextPayment, currency)}</p>
                <p className="mt-0.5 text-[11px] text-text-secondary">Approved, awaiting payout</p>
              </div>
              <div className="rounded-[20px] bg-[linear-gradient(135deg,_rgba(22,163,74,0.96),_rgba(34,197,94,0.78))] px-4 py-4 text-white shadow-sm" data-testid="total-earnings-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Total with Properfy</p>
                <p className="mt-2 text-xl font-bold">{formatCurrency(totalApproved, currency)}</p>
                <p className="mt-0.5 text-[11px] text-white/80">All-time approved</p>
              </div>
            </section>

            {dateFilter}

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-text-secondary">Earnings over time</h2>
              <EarningsChart bars={monthlyBars} currency={currency} />
            </div>

            {/* Inspector Property Invoice CTAs (spec 032) */}
            <button
              type="button"
              onClick={() => navigate('/earnings/request-invoice')}
              className="flex w-full items-center justify-between rounded-[20px] border border-primary/20 bg-primary/5 px-4 py-3.5 text-left shadow-sm"
              data-testid="request-invoice-cta"
            >
              <div className="flex items-center gap-3">
                <i className="mdi mdi-file-document-plus-outline text-xl text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-primary">Request Invoice</p>
                  <p className="text-xs text-text-secondary">For a completed billing period</p>
                </div>
              </div>
              <i className="mdi mdi-chevron-right text-xl text-primary" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/earnings/invoices')}
              className="flex w-full items-center justify-between rounded-[20px] border border-black/[0.06] bg-white px-4 py-3.5 text-left shadow-sm"
              data-testid="my-invoices-cta"
            >
              <div className="flex items-center gap-3">
                <i className="mdi mdi-receipt-text-outline text-xl text-text-secondary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">My Invoices</p>
                  <p className="text-xs text-text-secondary">View status and download PDFs</p>
                </div>
              </div>
              <i className="mdi mdi-chevron-right text-xl text-text-muted" aria-hidden="true" />
            </button>
          </>
        )}

        {!isLoading && !error && segment === 'history' && (
          <>
            {dateFilter}
            {filtered.length === 0 ? (
              <div className="rounded-[24px] bg-white p-6 text-center shadow-sm">
                <i className="mdi mdi-cash-multiple text-[48px] text-text-muted" aria-hidden="true" />
                <p className="mt-4 text-sm text-text-secondary">No payouts for this period.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-text-secondary">Payment history</h2>
                {filtered.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-[20px] bg-white px-4 py-3 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{formatCurrency(entry.amount, entry.currency)}</p>
                      <p className="text-xs text-text-muted">{formatDate(entry.effectiveAt)}</p>
                    </div>
                    <StatusChip status={entry.status} />
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
