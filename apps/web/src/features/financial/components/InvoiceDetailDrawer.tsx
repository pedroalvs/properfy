import { useCallback, useState } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { useInvoiceDetail } from '../hooks/useInvoiceDetail';
import { useInvoiceDownload } from '../hooks/useInvoiceDownload';
import { formatDateTime, formatDate } from '@/lib/format-date';
import { InvoiceStatusChip } from './InvoiceStatusChip';
import { usePermissions } from '@/hooks/usePermissions';
import { MarkInvoicePaidModal } from './MarkInvoicePaidModal';
import { ReversePaymentModal } from './ReversePaymentModal';

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Biweekly',
  MONTHLY: 'Monthly',
};

function formatCurrency(amount: number, currency: string): string {
  return amount.toLocaleString('en-AU', { style: 'currency', currency });
}

interface InvoiceDetailDrawerProps {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  resolveInspectorLabel?: (inspectorId: string) => string;
}

export function InvoiceDetailDrawer({
  invoiceId,
  open,
  onClose,
  resolveInspectorLabel,
}: InvoiceDetailDrawerProps) {
  const { invoice, isLoading, refetch } = useInvoiceDetail(invoiceId);
  const { download, isDownloading } = useInvoiceDownload();
  const { hasRole } = usePermissions();
  const canModifyPayments = hasRole('AM', 'OP');
  const inspectorLabel = invoice
    ? (resolveInspectorLabel?.(invoice.inspectorId) ?? invoice.inspectorId)
    : '';
  const canDownload = !!invoice && invoice.status !== 'OPEN' && !!invoice.fileKey;

  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);

  const handleDownload = useCallback(() => {
    if (invoiceId) {
      download(invoiceId);
    }
  }, [invoiceId, download]);

  const handlePaymentSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <DrawerPanel open={open} onClose={onClose} size="wide">
      <div className="flex h-full flex-col">
        {isLoading ? (
          <>
            <DrawerHeader title="Loading..." onClose={onClose} />
            <div className="flex-1 px-6 py-4">
              <LoadingState rows={6} />
            </div>
          </>
        ) : invoice ? (
          <>
            <DrawerHeader
              title={`Invoice - ${inspectorLabel}`}
              onClose={onClose}
              actions={
                <>
                  <InvoiceStatusChip status={invoice.status} />
                  <Button
                    variant="outlined"
                    onClick={handleDownload}
                    loading={isDownloading}
                    disabled={!canDownload}
                    aria-label="Download invoice"
                  >
                    <i className="mdi mdi-download-outline text-base" />
                    Download
                  </Button>
                  {canModifyPayments && invoice.status === 'CLOSED' && (
                    <Button
                      variant="primary"
                      onClick={() => setMarkPaidOpen(true)}
                      aria-label="Mark invoice as paid"
                    >
                      <i className="mdi mdi-cash-check text-base" />
                      Mark as Paid
                    </Button>
                  )}
                  {canModifyPayments && invoice.status === 'PAID' && (
                    <Button
                      variant="outlined"
                      onClick={() => setReverseOpen(true)}
                      aria-label="Reverse payment"
                    >
                      <i className="mdi mdi-undo-variant text-base" />
                      Reverse Payment
                    </Button>
                  )}
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-col gap-6">
                <FormSection title="Invoice Details">
                  <DetailRow label="Inspector" value={inspectorLabel} />
                  <DetailRow label="Period" value={`${formatDate(invoice.periodStart)} - ${formatDate(invoice.periodEnd)}`} />
                  <DetailRow label="Period Type" value={FREQUENCY_LABELS[invoice.periodType] ?? invoice.periodType} />
                  <DetailRow label="Total Amount" value={formatCurrency(invoice.totalAmount, invoice.currency)} />
                  <DetailRow label="Status" value={<InvoiceStatusChip status={invoice.status} />} />
                  <DetailRow label="Document" value={invoice.fileKey ? 'Ready' : 'Pending generation'} />
                  {invoice.status === 'OPEN' && (
                    <p className="text-sm text-text-muted">
                      This invoice is still open. The total can change until the invoice is closed.
                    </p>
                  )}
                </FormSection>

                {invoice.notes && (
                  <FormSection title="Notes">
                    <DetailRow label="Notes" value={invoice.notes} />
                  </FormSection>
                )}

                <FormSection title="Record">
                  <DetailRow label="Created at" value={formatDateTime(invoice.createdAt)} />
                  <DetailRow label="Generated at" value={invoice.generatedAt ? formatDateTime(invoice.generatedAt) : 'Pending generation'} />
                  <DetailRow label="Paid at" value={invoice.paidAt ? formatDateTime(invoice.paidAt) : 'Not paid'} />
                  {invoice.status === 'PAID' && (
                    <>
                      <DetailRow
                        label="Paid by"
                        value={invoice.paidByUserId ?? 'Unknown user'}
                      />
                      <DetailRow
                        label="Payment reference"
                        value={invoice.paymentReference ?? '—'}
                      />
                    </>
                  )}
                  <DetailRow label="Updated at" value={formatDateTime(invoice.updatedAt ?? invoice.createdAt)} />
                </FormSection>
              </div>
            </div>
          </>
        ) : null}
      </div>
      {invoice && (
        <>
          <MarkInvoicePaidModal
            open={markPaidOpen}
            onClose={() => setMarkPaidOpen(false)}
            invoiceIds={[invoice.id]}
            onSuccess={handlePaymentSuccess}
          />
          <ReversePaymentModal
            open={reverseOpen}
            onClose={() => setReverseOpen(false)}
            invoiceId={invoice.id}
            onSuccess={handlePaymentSuccess}
          />
        </>
      )}
    </DrawerPanel>
  );
}
