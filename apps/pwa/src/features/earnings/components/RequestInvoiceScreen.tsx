import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { TopBar } from '@/components/shell/TopBar';
import {
  useAvailablePeriods,
  usePreviewInvoice,
  useRequestInvoice,
  type AvailablePeriod,
} from '../hooks/useInspectorInvoices';
import { formatInvoiceCurrency } from '../lib/invoiceStatus';
import { formatCivilDate } from '@/lib/format-date';

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
          <Card className="border-success bg-success/5 px-5 py-5" data-testid="request-invoice-success">
            <Badge tone="green">Request submitted</Badge>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{formatInvoiceCurrency(request.data.totalAmount, request.data.currency)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{request.data.payoutCount} payout{request.data.payoutCount === 1 ? '' : 's'} · awaiting review</p>
            <p className="mt-1 text-xs text-muted-foreground">Period: {formatCivilDate(request.data.periodStart)} to {formatCivilDate(request.data.periodEnd)}</p>
            <Button variant="outlined" block onClick={() => navigate('/earnings/invoices')} className="mt-4">
              View my invoices
            </Button>
          </Card>
        ) : (
          <>
            <Card className="px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Closed {cycleLabel} periods
              </p>

              {periodsQuery.isLoading && <Skeleton className="mt-3 h-24 rounded-btn" />}
              {periodsQuery.isError && (
                <p className="mt-3 text-sm text-destructive" role="alert">Unable to load periods. Please try again.</p>
              )}
              {!periodsQuery.isLoading && !periodsQuery.isError && periods.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">No closed periods are available yet.</p>
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
                      className={cn(
                        'flex min-h-touch items-center justify-between rounded-btn border px-3 py-2.5 text-left text-sm',
                        isSelected ? 'border-primary bg-primary/5 text-primary' : 'border-border text-foreground',
                      )}
                      data-testid="period-option"
                    >
                      <span>{formatCivilDate(p.periodStart)} → {formatCivilDate(p.periodEnd)}</span>
                      {isSelected && <i className="mdi mdi-check-circle text-lg" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </Card>

            {selected && (
              <Card className="px-4 py-4" data-testid="request-invoice-preview">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Preview</p>
                {previewQuery.isLoading ? (
                  <Skeleton className="mt-3 h-14 rounded-btn" />
                ) : previewQuery.data ? (
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {formatInvoiceCurrency(previewQuery.data.totalAmount, previewQuery.data.currency ?? 'AUD')}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {previewQuery.data.payoutCount} approved payout{previewQuery.data.payoutCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Unable to load preview.</p>
                )}
              </Card>
            )}

            {requestError && (
              <Alert tone="destructive" data-testid="request-invoice-error">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
                <AlertDescription className="font-semibold opacity-100">{requestError}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleConfirm} loading={request.isPending} disabled={!canConfirm} block>
              Request Invoice
            </Button>

            <div className="rounded-card bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Request an invoice for a completed billing period. Only fully closed periods with approved payouts can be requested; the backoffice will review it.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
