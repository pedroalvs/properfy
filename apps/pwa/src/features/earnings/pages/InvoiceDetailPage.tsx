import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';
import { TopBar } from '@/components/shell/TopBar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyInvoiceDetail, downloadInvoice } from '../hooks/useInspectorInvoices';
import { invoiceStatusBadge, isApproved, formatInvoiceCurrency } from '../lib/invoiceStatus';
import { getErrorMessage } from '@/lib/api-error';
import { formatCivilDate } from '@/lib/format-date';

export function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { data, isLoading, isError, error } = useMyInvoiceDetail(invoiceId);
  const invoice = data?.data;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadInvoice(invoice.id);
    } catch (err) {
      // Keep the real error in the console for production diagnosis; show a friendly message.
      console.error('Invoice PDF download failed', err);
      setDownloadError('The PDF is not ready yet. Please try again shortly.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full" data-testid="invoice-detail-screen">
      <TopBar title="Invoice" showBack backTo="/earnings/invoices" backHideOnWide />

      <div className="flex flex-col gap-4 p-4">
        {isLoading && <Skeleton className="h-40 rounded-card" />}
        {isError && (
          <Alert tone="destructive">
            <AlertTitle>Unable to load this invoice.</AlertTitle>
            <AlertDescription>{getErrorMessage(error)}</AlertDescription>
          </Alert>
        )}

        {invoice && (
          <>
            <Card className="px-4 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Property Invoice</p>
                  <p className="mt-1 text-lg font-bold text-foreground">{invoice.invoiceNumberDisplay ?? 'Awaiting number'}</p>
                </div>
                <Badge tone={invoiceStatusBadge(invoice.status).tone}>{invoiceStatusBadge(invoice.status).label}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{formatCivilDate(invoice.periodStart)} → {formatCivilDate(invoice.periodEnd)}</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}</p>
              {invoice.status === 'VOID' && invoice.notes && (
                <p className="mt-2 rounded-btn bg-destructive/10 px-3 py-2 text-xs text-destructive">Rejected: {invoice.notes}</p>
              )}
            </Card>

            {invoice.lineItemsSnapshot && invoice.lineItemsSnapshot.length > 0 && (
              <Card className="px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Line items</p>
                <div className="mt-3 flex flex-col gap-3">
                  {invoice.lineItemsSnapshot.map((line, i) => (
                    <div key={`${line.appointmentCode}-${i}`} className={cn('border-t border-border pt-2 first:border-t-0 first:pt-0')}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{line.appointmentCode}</p>
                        <p className="text-sm font-semibold text-foreground">{formatInvoiceCurrency(line.amount, invoice.currency)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{line.propertyAddress ?? '—'}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatCivilDate(line.serviceDate)} · {line.serviceType ?? '—'} · {line.agencyName ?? '—'}{line.branchName ? ` / ${line.branchName}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {isApproved(invoice.status) && (
              <>
                <Button onClick={handleDownload} loading={downloading} disabled={!invoice.fileKey} block>
                  {invoice.fileKey ? 'Download PDF' : 'PDF generating…'}
                </Button>
                {downloadError && (
                  <Alert tone="destructive">
                    <AlertDescription>{downloadError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
