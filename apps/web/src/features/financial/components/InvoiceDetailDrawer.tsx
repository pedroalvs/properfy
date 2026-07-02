import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { MarkInvoicePaidModal } from './MarkInvoicePaidModal';
import { ReversePaymentModal } from './ReversePaymentModal';
import { RejectDraftModal } from './RejectDraftModal';

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: 'Weekly',
  FORTNIGHTLY: 'Fortnightly',
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
  const { showSuccess, showError } = useSnackbar();
  const queryClient = useQueryClient();
  const canModifyPayments = hasRole('AM', 'OP');
  const canReviewDraft = hasRole('AM', 'OP');
  const inspectorLabel = invoice
    ? (resolveInspectorLabel?.(invoice.inspectorId) ?? invoice.inspectorId)
    : '';
  const canDownload = !!invoice && invoice.status !== 'PENDING_REVIEW' && !!invoice.fileKey;

  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [rejectDraftOpen, setRejectDraftOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const handleDownload = useCallback(() => {
    if (invoiceId) {
      download(invoiceId);
    }
  }, [invoiceId, download]);

  const handlePaymentSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleApproveDraft = useCallback(async () => {
    if (!invoiceId) return;
    setIsApproving(true);
    try {
      const { error } = await api.POST(
        '/v1/billing/invoices/{invoiceId}/approve-draft' as never,
        {
          params: { path: { invoiceId } },
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        } as never,
      );
      if (error) {
        const err = error as { status?: number; error?: { code?: string } };
        if (err.status === 403) {
          showError('You do not have permission to approve draft invoices.');
        } else if (err.error?.code === 'INVOICE_NOT_PENDING_REVIEW') {
          showError('This invoice is not in pending review status.');
        } else {
          showError('Failed to approve draft invoice. Please try again.');
        }
        return;
      }
      showSuccess('Draft invoice approved');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      refetch();
    } catch {
      showError('Failed to approve draft invoice. Please try again.');
    } finally {
      setIsApproving(false);
    }
  }, [invoiceId, queryClient, refetch, showError, showSuccess]);

  const handleRejectDraftSuccess = useCallback(() => {
    onClose();
  }, [onClose]);

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
                  {canReviewDraft && invoice.status === 'PENDING_REVIEW' && (
                    <>
                      <Button
                        variant="primary"
                        loading={isApproving}
                        onClick={handleApproveDraft}
                        aria-label="Approve draft invoice"
                        className="!bg-success hover:!bg-success/90"
                      >
                        <i className="mdi mdi-check-bold text-base" />
                        Approve
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => setRejectDraftOpen(true)}
                        aria-label="Reject draft invoice"
                        className="!border-error !text-error hover:!bg-error/5"
                      >
                        <i className="mdi mdi-close-thick text-base" />
                        Reject
                      </Button>
                    </>
                  )}
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
                  <DetailRow label="Number" value={invoice.invoiceNumberDisplay ?? '—'} />
                  <DetailRow label="Inspector" value={inspectorLabel} />
                  <DetailRow label="Period" value={`${formatDate(invoice.periodStart)} - ${formatDate(invoice.periodEnd)}`} />
                  <DetailRow label="Period Type" value={FREQUENCY_LABELS[invoice.periodType] ?? invoice.periodType} />
                  <DetailRow label="Total Amount" value={formatCurrency(invoice.totalAmount, invoice.currency)} />
                  <DetailRow label="Status" value={<InvoiceStatusChip status={invoice.status} />} />
                  <DetailRow label="Document" value={invoice.fileKey ? 'Ready' : 'Pending generation'} />
                  {invoice.status === 'PENDING_REVIEW' && (
                    <p className="text-sm text-text-muted">
                      This draft invoice is awaiting admin review before it becomes active.
                    </p>
                  )}
                </FormSection>

                {invoice.lineItemsSnapshot && invoice.lineItemsSnapshot.length > 0 && (
                  <FormSection title="Property Invoice line items">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-text-muted">
                            <th className="py-1 pr-3">Date</th>
                            <th className="py-1 pr-3">Appointment</th>
                            <th className="py-1 pr-3">Property</th>
                            <th className="py-1 pr-3">Service</th>
                            <th className="py-1 pr-3">Agency</th>
                            <th className="py-1 pr-3">Branch</th>
                            <th className="py-1 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.lineItemsSnapshot.map((line) => (
                            <tr key={line.appointmentId} className="border-t border-black/5">
                              <td className="py-1 pr-3">{line.serviceDate}</td>
                              <td className="py-1 pr-3">{line.appointmentCode}</td>
                              <td className="py-1 pr-3">{line.propertyAddress ?? '—'}</td>
                              <td className="py-1 pr-3">{line.serviceType ?? '—'}</td>
                              <td className="py-1 pr-3">{line.agencyName ?? '—'}</td>
                              <td className="py-1 pr-3">{line.branchName ?? '—'}</td>
                              <td className="py-1 text-right">{formatCurrency(line.amount, invoice.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </FormSection>
                )}

                {invoice.notes && (
                  <FormSection title="Notes">
                    <DetailRow label={invoice.status === 'VOID' ? 'Rejection reason' : 'Notes'} value={invoice.notes} />
                  </FormSection>
                )}

                <FormSection title="Record">
                  <DetailRow label="Created at" value={formatDateTime(invoice.createdAt)} />
                  <DetailRow label="Issued at" value={invoice.issuedAt ? formatDateTime(invoice.issuedAt) : 'Pending generation'} />
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
          <RejectDraftModal
            open={rejectDraftOpen}
            onClose={() => setRejectDraftOpen(false)}
            invoiceId={invoice.id}
            onSuccess={handleRejectDraftSuccess}
          />
        </>
      )}
    </DrawerPanel>
  );
}
