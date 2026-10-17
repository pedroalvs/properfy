import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, FilePlus2, ReceiptText, ChevronRight } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { TopBar } from '@/components/shell/TopBar';
import { formatCurrency } from '@/lib/format-currency';
import { formatInstantDateTime } from '@/lib/format-date';
import {
  useInspectorEarningsSummary,
  useInspectorPayoutHistory,
} from '../hooks/useInspectorEarnings';
import { EarningsChart, type ChartBar } from '../components/EarningsChart';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';

type Segment = 'earnings' | 'history';

type BadgeTone = NonNullable<BadgeProps['tone']>;

const SEGMENT_OPTIONS: ReadonlyArray<{ id: Segment; label: string }> = [
  { id: 'earnings', label: 'This week' },
  { id: 'history', label: 'History' },
];

const PAYOUT_TONE: Record<string, { label: string; tone: BadgeTone }> = {
  APPROVED: { label: 'Approved', tone: 'green' },
  PENDING: { label: 'Pending', tone: 'amber' },
  CANCELLED: { label: 'Cancelled', tone: 'red' },
  VOIDED: { label: 'Voided', tone: 'gray' },
};

/** Payment status chip for a payout entry. */
function StatusChip({ status }: { status: string }) {
  const s = PAYOUT_TONE[status] ?? { label: status, tone: 'gray' as BadgeTone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Shared error card for a segment: icon + message + retry. */
function SegmentError({ message, fallback, onRetry }: { message?: string; fallback: string; onRetry: () => void }) {
  return (
    <Card className="p-6 text-center">
      <Banknote size={48} className="text-muted-foreground" aria-hidden="true" />
      <p className="mt-4 text-sm text-muted-foreground">{message || fallback}</p>
      <Button variant="outlined" onClick={onRetry} className="mt-3">
        Retry
      </Button>
    </Card>
  );
}

/** Convert a YYYY-MM key from the summary into a short month label (e.g. "Jul"). */
function monthLabel(month: string): string {
  const [year = 0, m = 1] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-AU', { month: 'short' });
}

export function EarningsPage() {
  const navigate = useNavigate();
  const [segment, setSegment] = useState<Segment>('earnings');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const summary = useInspectorEarningsSummary();
  const history = useInspectorPayoutHistory({
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const monthlyBars = useMemo<ChartBar[]>(
    () => (summary.data?.monthly ?? []).map((m) => ({ label: monthLabel(m.month), value: m.total })),
    [summary.data],
  );

  const entries = useMemo(
    () => history.data?.pages.flatMap((p) => p.data) ?? [],
    [history.data],
  );

  const clearRange = useCallback(() => {
    setFromDate('');
    setToDate('');
  }, []);

  // Infinite scroll: fetch the next page when the sentinel enters the viewport.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (segment !== 'history' || !el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((observed) => {
      if (observed.some((e) => e.isIntersecting)) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [segment, hasNextPage, fetchNextPage, entries.length]);

  const currency = summary.data?.currency ?? 'AUD';

  const dateFilter = (
    <Card className="flex items-end gap-2 px-4 py-3">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From</span>
        <DateField
          value={fromDate}
          onChange={setFromDate}
          className="rounded-btn border border-border px-2 py-1.5 text-sm"
          aria-label="From date"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To</span>
        <DateField
          value={toDate}
          onChange={setToDate}
          className="rounded-btn border border-border px-2 py-1.5 text-sm"
          aria-label="To date"
        />
      </label>
      {(fromDate || toDate) && (
        <button type="button" onClick={clearRange} className="pb-1.5 text-xs font-semibold text-primary" aria-label="Clear date filter">
          Clear
        </button>
      )}
    </Card>
  );

  return (
    <div className="w-full">
      <TopBar title="Earnings" />
      <div className="flex flex-col gap-4 p-4">
        {/* Segmented control: This week | History */}
        <Segmented value={segment} options={SEGMENT_OPTIONS} onChange={setSegment} aria-label="Earnings view" />

        {segment === 'earnings' && summary.isLoading && (
          <div className="flex flex-col gap-3" data-testid="earnings-skeleton">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-32 rounded-card" />
          </div>
        )}

        {segment === 'earnings' && summary.error && (
          <SegmentError
            message={summary.error.message}
            fallback="Unable to load earnings at this time. Please try again later."
            onRetry={() => summary.refetch()}
          />
        )}

        {segment === 'earnings' && !summary.isLoading && !summary.error && summary.data && (
          // Overview dashboard. On tablet a 2-column grid: the left column is the overview
          // (summary + chart); the right column is recent activity + invoice actions. The recent-
          // payments list fills the right column with useful content instead of leaving a gap, and
          // is tablet-only (`hidden md:block`) so phone keeps summary → chart → CTAs unchanged.
          <div className="flex flex-col gap-4 md:grid md:grid-cols-[1.4fr_1fr] md:gap-4 md:items-start" data-testid="earnings-dashboard">
            <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Earnings summary</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-btn border border-border p-3" data-testid="total-earnings-card">
                  <Badge tone="green">Approved</Badge>
                  <p className="mt-2 text-xl font-bold text-foreground">{formatCurrency(summary.data.totalApproved, currency)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">All-time approved</p>
                </div>
                <div className="rounded-btn border border-border p-3" data-testid="next-payment-card">
                  <Badge tone="amber">Pending review</Badge>
                  <p className="mt-2 text-xl font-bold text-foreground">{formatCurrency(summary.data.nextPayment, currency)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Pending, awaiting approval</p>
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">Earnings over time</h2>
              <EarningsChart bars={monthlyBars} currency={currency} />
            </div>
            </div>

            {/* Side column: recent activity + invoice actions. */}
            <div className="flex flex-col gap-4">
            {/* Recent payments — a tablet-only overview of the latest payouts, with a link to the
                full History tab. Hidden on phone so the validated phone stack is unchanged. */}
            <div className="hidden md:block">
              <Card className="flex flex-col gap-3" data-testid="recent-payments">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent payments</p>
                  {entries.length > 0 && (
                    <button type="button" onClick={() => setSegment('history')} className="text-xs font-semibold text-primary">
                      View all
                    </button>
                  )}
                </div>
                {entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments yet.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {entries.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium text-foreground">{formatCurrency(entry.amount, entry.currency)}</p>
                          <p className="text-xs text-muted-foreground">{formatInstantDateTime(entry.effectiveAt)}</p>
                        </div>
                        <StatusChip status={entry.status} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Inspector Property Invoice CTAs (spec 032) */}
            <Button
              variant="outlined"
              block
              onClick={() => navigate('/earnings/request-invoice')}
              className="rounded-full"
              data-testid="request-invoice-cta"
            >
              <FilePlus2 size={20} aria-hidden="true" />
              Request Invoice
            </Button>
            <button
              type="button"
              onClick={() => navigate('/earnings/invoices')}
              className={cn('flex w-full items-center justify-between rounded-card border border-border bg-card px-4 py-3.5 text-left shadow-sm')}
              data-testid="my-invoices-cta"
            >
              <div className="flex items-center gap-3">
                <ReceiptText size={20} className="text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">My Invoices</p>
                  <p className="text-xs text-muted-foreground">View status and download PDFs</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-muted-foreground" aria-hidden="true" />
            </button>
            </div>
          </div>
        )}

        {segment === 'history' && (
          <>
            {dateFilter}

            {history.isLoading && (
              <div className="flex flex-col gap-3" data-testid="history-skeleton">
                <Skeleton className="h-16 rounded-card" />
                <Skeleton className="h-16 rounded-card" />
                <Skeleton className="h-16 rounded-card" />
              </div>
            )}

            {history.error && entries.length === 0 && (
              <SegmentError
                message={history.error.message}
                fallback="Unable to load payment history. Please try again later."
                onRetry={() => history.refetch()}
              />
            )}

            {!history.isLoading && !history.error && entries.length === 0 && (
              <Card className="p-6 text-center">
                <Banknote size={48} className="text-muted-foreground" aria-hidden="true" />
                <p className="mt-4 text-sm text-muted-foreground">No payouts for this period.</p>
              </Card>
            )}

            {!history.isLoading && entries.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-foreground">Payment history</h2>
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]" data-testid="history-list">
                {entries.map((entry) => (
                  <Card key={entry.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatCurrency(entry.amount, entry.currency)}</p>
                      <p className="text-xs text-muted-foreground">{formatInstantDateTime(entry.effectiveAt)}</p>
                    </div>
                    <StatusChip status={entry.status} />
                  </Card>
                ))}
                </div>

                <div ref={sentinelRef} aria-hidden="true" />
                {isFetchingNextPage && <Skeleton className="h-16 rounded-card" data-testid="history-loading-more" />}
                {history.isFetchNextPageError && !isFetchingNextPage && (
                  <Card className="flex items-center justify-between px-4 py-3" data-testid="history-load-more-error">
                    <p className="text-xs text-muted-foreground">Couldn't load more payouts.</p>
                    <button type="button" onClick={() => fetchNextPage()} className="text-sm font-semibold text-primary">
                      Retry
                    </button>
                  </Card>
                )}
                {hasNextPage && !isFetchingNextPage && !history.isFetchNextPageError && (
                  <Button variant="outlined" block onClick={() => fetchNextPage()} data-testid="history-load-more">
                    Load more
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
