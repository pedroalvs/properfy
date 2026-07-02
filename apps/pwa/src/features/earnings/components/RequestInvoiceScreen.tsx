import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { TopBar } from '@/components/shell/TopBar';
import {
  useAvailablePeriods,
  usePreviewInvoice,
  useRequestInvoice,
  type AvailablePeriod,
} from '../hooks/useInspectorInvoices';
import { formatInvoiceCurrency } from '../lib/invoiceStatus';

const ERROR_MESSAGES: Record<string, string> = {
  INVOICE_EMPTY_PERIOD: 'No approved payouts found for the selected period.',
  INVOICE_ACTIVE_EXISTS: 'You already have an active invoice for this period.',
  INVOICE_MIXED_CURRENCY: 'Payouts in this period use more than one currency.',
  INVOICE_PERIOD_NOT_CLOSED: 'This period has not finished yet.',
  INVOICE_PERIOD_NOT_ALIGNED: 'The period does not match your billing cycle.',
};

const PERIOD_LABELS: Record<string, string> = { WEEKLY: 'Weekly', FORTNIGHTLY: 'Fortnightly', MONTHLY: 'Monthly' };

export function RequestInvoiceScreen() {
  const navigate = useNavigate();
  const periodsQuery = useAvailablePeriods();
  const [selected, setSelected] = useState<AvailablePeriod | null>(null);
  const previewQuery = usePreviewInvoice(selected);
  const request = useRequestInvoice();

  const periods = periodsQuery.data?.periods ?? [];
  const cycleLabel = periodsQuery.data ? PERIOD_LABELS[periodsQuery.data.billingCycle] ?? periodsQuery.data.billingCycle : '';

  const requestError = request.error ? ERROR_MESSAGES[request.error.code ?? ''] ?? request.error.message : null;
  const canConfirm = !!selected && (previewQuery.data?.payoutCount ?? 0) > 0 && !request.isPending;

  const handleConfirm = () => {
    if (!selected) return;
    request.mutate({ periodStart: selected.periodStart, periodEnd: selected.periodEnd });
  };

  return (
    <div className="w-full" data-testid="request-invoice-screen">
      <TopBar title="Request Invoice" showBack backTo="/earnings" />

      <div className="flex flex-col gap-4 p-4">
        {request.isSuccess && request.data ? (
          <section
            className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(22,163,74,0.96),_rgba(34,197,94,0.78))] px-5 py-5 text-white shadow-[0_18px_44px_rgba(22,163,74,0.18)]"
            data-testid="request-invoice-success"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Request submitted</p>
            <p className="mt-3 text-2xl font-bold tracking-tight">{formatInvoiceCurrency(request.data.totalAmount, request.data.currency)}</p>
            <p className="mt-1 text-sm text-white/80">{request.data.payoutCount} payout{request.data.payoutCount === 1 ? '' : 's'} · awaiting review</p>
            <p className="mt-1 text-xs text-white/60">Period: {request.data.periodStart} to {request.data.periodEnd}</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => navigate('/earnings/invoices')} className="!rounded-2xl bg-white/20">View my invoices</Button>
            </div>
          </section>
        ) : (
          <>
            <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                Closed {cycleLabel} periods
              </p>

              {periodsQuery.isLoading && <div className="mt-3 h-24 animate-pulse rounded-xl bg-gray-100" />}
              {periodsQuery.isError && (
                <p className="mt-3 text-sm text-error" role="alert">Unable to load periods. Please try again.</p>
              )}
              {!periodsQuery.isLoading && !periodsQuery.isError && periods.length === 0 && (
                <p className="mt-3 text-sm text-text-secondary">No closed periods are available yet.</p>
              )}

              <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Billing period">
                {periods.map((p) => {
                  const isSelected = selected?.periodStart === p.periodStart && selected?.periodEnd === p.periodEnd;
                  return (
                    <button
                      key={`${p.periodStart}_${p.periodEnd}`}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelected(p)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${
                        isSelected ? 'border-primary bg-primary/5 text-primary' : 'border-border-subtle text-text-primary'
                      }`}
                      data-testid="period-option"
                    >
                      <span>{p.periodStart} → {p.periodEnd}</span>
                      {isSelected && <i className="mdi mdi-check-circle text-lg" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>

            {selected && (
              <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-sm" data-testid="request-invoice-preview">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Preview</p>
                {previewQuery.isLoading ? (
                  <div className="mt-3 h-14 animate-pulse rounded-xl bg-gray-100" />
                ) : previewQuery.data ? (
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-text-primary">
                        {formatInvoiceCurrency(previewQuery.data.totalAmount, previewQuery.data.currency ?? 'AUD')}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {previewQuery.data.payoutCount} approved payout{previewQuery.data.payoutCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-text-secondary">Unable to load preview.</p>
                )}
              </section>
            )}

            {requestError && (
              <section className="flex items-center gap-3 rounded-[20px] border border-error/20 bg-error/10 px-4 py-3.5" role="alert" data-testid="request-invoice-error">
                <i className="mdi mdi-alert-circle-outline text-xl text-error shrink-0" aria-hidden="true" />
                <p className="text-sm font-semibold text-error">{requestError}</p>
              </section>
            )}

            <Button onClick={handleConfirm} loading={request.isPending} disabled={!canConfirm} className="w-full !rounded-2xl">
              Request Invoice
            </Button>

            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
              Request an invoice for a completed billing period. Only fully closed periods with approved payouts can be requested; the backoffice will review it.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
