import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api-error';
import { Button } from '@/components/ui/Button';
import { TopBar } from '@/components/shell/TopBar';

interface DraftInvoiceResult {
  data: {
    id: string;
    total: number;
    currency: string;
    entryCount: number;
    periodStart: string;
    periodEnd: string;
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  INVOICE_EMPTY_PERIOD: 'No earnings found for the selected period.',
  INVOICE_PERIOD_OVERLAP: 'An invoice already exists that overlaps this period.',
  INVOICE_INVALID_PERIOD: 'The selected period is invalid. End date must be after start date.',
};

function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(amount);
}

function getToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getFirstOfMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function DraftInvoiceScreen() {
  const [periodStart, setPeriodStart] = useState(getFirstOfMonth());
  const [periodEnd, setPeriodEnd] = useState(getToday());

  const mutation = useMutation<DraftInvoiceResult, ApiError, { periodStart: string; periodEnd: string }>({
    mutationFn: (data) => apiPost<DraftInvoiceResult>('/v1/inspector/invoices/draft', data),
  });

  const handleSubmit = () => {
    if (!periodStart || !periodEnd) return;
    mutation.mutate({ periodStart, periodEnd });
  };

  const errorMessage = mutation.error
    ? ERROR_MESSAGES[mutation.error.code ?? ''] ?? mutation.error.message
    : null;

  return (
    <div className="w-full" data-testid="draft-invoice-screen">
      <TopBar title="Draft Invoice" showBack backTo="/earnings" />

      <div className="flex flex-col gap-4 p-4">
        {/* Period inputs */}
        <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Invoice Period</p>

          <div className="mt-3 flex flex-col gap-3">
            <div>
              <label htmlFor="period-start" className="block text-xs font-semibold text-text-secondary">
                Start date
              </label>
              <input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-subtle bg-app-bg px-3 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="period-start-input"
              />
            </div>
            <div>
              <label htmlFor="period-end" className="block text-xs font-semibold text-text-secondary">
                End date
              </label>
              <input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-subtle bg-app-bg px-3 py-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                data-testid="period-end-input"
              />
            </div>
          </div>

          <div className="mt-4">
            <Button
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={!periodStart || !periodEnd}
              className="w-full !rounded-2xl"
            >
              Generate Draft Invoice
            </Button>
          </div>
        </section>

        {/* Error */}
        {mutation.isError && errorMessage && (
          <section
            className="flex items-center gap-3 rounded-[20px] border border-error/20 bg-error/10 px-4 py-3.5"
            role="alert"
            data-testid="draft-invoice-error"
          >
            <i className="mdi mdi-alert-circle-outline text-xl text-error shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold text-error">{errorMessage}</p>
          </section>
        )}

        {/* Success */}
        {mutation.isSuccess && mutation.data?.data && (
          <section
            className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(22,163,74,0.96),_rgba(34,197,94,0.78))] px-5 py-5 text-white shadow-[0_18px_44px_rgba(22,163,74,0.18)]"
            data-testid="draft-invoice-success"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Invoice Created</p>
            <p className="mt-3 text-2xl font-bold tracking-tight">
              {formatCurrency(mutation.data.data.total, mutation.data.data.currency)}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {mutation.data.data.entryCount} entr{mutation.data.data.entryCount === 1 ? 'y' : 'ies'} included
            </p>
            <p className="mt-1 text-xs text-white/60">
              Period: {mutation.data.data.periodStart} to {mutation.data.data.periodEnd}
            </p>
          </section>
        )}

        {/* Explanation */}
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
          Generate a draft invoice for your approved payouts within the selected period.
          The invoice will include all approved financial entries not yet invoiced.
        </div>
      </div>
    </div>
  );
}
