import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { Button } from '@/components/ui/Button';
import { useMyInvoiceDetail, downloadInvoice } from '../hooks/useInspectorInvoices';
import { invoiceStatusBadge, isApproved, formatInvoiceCurrency } from '../lib/invoiceStatus';

export function InvoiceDetailScreen() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { data, isLoading, isError } = useMyInvoiceDetail(invoiceId);
  const invoice = data?.data;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadInvoice(invoice.id);
    } catch {
      setDownloadError('The PDF is not ready yet. Please try again shortly.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full" data-testid="invoice-detail-screen">
      <TopBar title="Invoice" showBack backTo="/earnings/invoices" />

      <div className="flex flex-col gap-4 p-4">
        {isLoading && <div className="h-40 animate-pulse rounded-[20px] bg-gray-100" />}
        {isError && <p className="text-sm text-error" role="alert">Unable to load this invoice.</p>}

        {invoice && (
          <>
            <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Property Invoice</p>
                  <p className="mt-1 text-lg font-bold text-text-primary">{invoice.invoiceNumberDisplay ?? 'Awaiting number'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${invoiceStatusBadge(invoice.status).className}`}>
                  {invoiceStatusBadge(invoice.status).label}
                </span>
              </div>
              <p className="mt-2 text-xs text-text-secondary">{invoice.periodStart} → {invoice.periodEnd}</p>
              <p className="mt-2 text-2xl font-bold text-text-primary">{formatInvoiceCurrency(invoice.totalAmount, invoice.currency)}</p>
              {invoice.status === 'VOID' && invoice.notes && (
                <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">Rejected: {invoice.notes}</p>
              )}
            </section>

            {invoice.lineItemsSnapshot && invoice.lineItemsSnapshot.length > 0 && (
              <section className="rounded-[20px] border border-black/[0.06] bg-white px-4 py-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">Line items</p>
                <div className="mt-3 flex flex-col gap-3">
                  {invoice.lineItemsSnapshot.map((line, i) => (
                    <div key={`${line.appointmentCode}-${i}`} className="border-t border-black/5 pt-2 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-text-primary">{line.appointmentCode}</p>
                        <p className="text-sm font-semibold text-text-primary">{formatInvoiceCurrency(line.amount, invoice.currency)}</p>
                      </div>
                      <p className="text-xs text-text-secondary">{line.propertyAddress ?? '—'}</p>
                      <p className="text-[11px] text-text-muted">
                        {line.serviceDate} · {line.serviceType ?? '—'} · {line.agencyName ?? '—'}{line.branchName ? ` / ${line.branchName}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isApproved(invoice.status) && (
              <>
                <Button onClick={handleDownload} loading={downloading} disabled={!invoice.fileKey} className="w-full !rounded-2xl">
                  {invoice.fileKey ? 'Download PDF' : 'PDF generating…'}
                </Button>
                {downloadError && <p className="text-sm text-error" role="alert">{downloadError}</p>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
