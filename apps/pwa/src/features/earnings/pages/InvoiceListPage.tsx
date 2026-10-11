import { useNavigate } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';
import { TopBar } from '@/components/shell/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyInvoices } from '../hooks/useInspectorInvoices';
import { invoiceStatusBadge, formatInvoiceCurrency } from '../lib/invoiceStatus';
import { getErrorMessage } from '@/lib/api-error';
import { formatCivilDate } from '@/lib/format-date';

export function InvoiceListPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useMyInvoices();
  const invoices = data?.data ?? [];

  return (
    <div className="w-full" data-testid="invoice-list-screen">
      <TopBar title="My Invoices" showBack backTo="/earnings" />

      <div className="flex flex-col gap-3 p-4">
        {isLoading && (
          <>
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-20 rounded-card" />
          </>
        )}

        {isError && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Unable to load invoices.</p>
            <p className="mt-1 text-xs text-muted-foreground">{getErrorMessage(error)}</p>
            <Button variant="outlined" onClick={() => refetch()} className="mt-3">
              Retry
            </Button>
          </Card>
        )}

        {!isLoading && !isError && invoices.length === 0 && (
          <Card className="p-6 text-center" data-testid="invoice-list-empty">
            <i className="mdi mdi-file-document-outline text-[40px] text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">You have no invoices yet.</p>
          </Card>
        )}

        {invoices.map((inv) => {
          const badge = invoiceStatusBadge(inv.status);
          return (
            <button
              key={inv.id}
              type="button"
              onClick={() => navigate(`/earnings/invoices/${inv.id}`)}
              className={cn(
                'flex w-full items-center justify-between rounded-card border border-border bg-card p-4 text-left shadow-sm',
              )}
              data-testid="invoice-list-item"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{inv.invoiceNumberDisplay ?? 'Awaiting number'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatCivilDate(inv.periodStart)} → {formatCivilDate(inv.periodEnd)}</p>
                <p className="mt-1 text-base font-bold text-foreground">{formatInvoiceCurrency(inv.totalAmount, inv.currency)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                {inv.status === 'PAID' && <Badge tone="blue">Paid</Badge>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
