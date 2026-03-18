import { useCallback } from 'react';
import { DrawerPanel } from '@/components/ui/DrawerPanel';
import { DrawerHeader } from '@/components/ui/DrawerHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/feedback/LoadingState';
import { FormSection } from '@/components/forms/FormSection';
import { DetailRow } from '@/components/data/DetailRow';
import { useInvoiceDetail } from '../hooks/useInvoiceDetail';
import { useInvoiceDownload } from '../hooks/useInvoiceDownload';
import { formatDateTime } from '@/lib/format-date';
import { InvoiceStatusChip } from './InvoiceStatusChip';
import { FinancialEntryTypeChip } from './FinancialEntryTypeChip';
import { FinancialStatusChip } from './FinancialStatusChip';

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
}

export function InvoiceDetailDrawer({ invoiceId, open, onClose }: InvoiceDetailDrawerProps) {
  const { invoice, isLoading } = useInvoiceDetail(invoiceId);
  const { download, isDownloading } = useInvoiceDownload();

  const handleDownload = useCallback(() => {
    if (invoiceId) {
      download(invoiceId);
    }
  }, [invoiceId, download]);

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
              title={`Invoice - ${invoice.inspectorName}`}
              onClose={onClose}
              actions={
                <>
                  <InvoiceStatusChip status={invoice.status} />
                  <Button
                    variant="outlined"
                    onClick={handleDownload}
                    loading={isDownloading}
                    aria-label="Download invoice"
                  >
                    <i className="mdi mdi-download-outline text-base" />
                    Download
                  </Button>
                </>
              }
            />
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-col gap-6">
                <FormSection title="Invoice Details">
                  <DetailRow label="Inspector" value={invoice.inspectorName} />
                  <DetailRow label="Period" value={`${formatDateTime(invoice.periodStart)} - ${formatDateTime(invoice.periodEnd)}`} />
                  <DetailRow label="Frequency" value={FREQUENCY_LABELS[invoice.frequency] ?? invoice.frequency} />
                  <DetailRow label="Total Amount" value={formatCurrency(invoice.totalAmount, invoice.currency)} />
                  <DetailRow label="Entries" value={String(invoice.entryCount)} />
                  <DetailRow label="Status" value={<InvoiceStatusChip status={invoice.status} />} />
                </FormSection>

                {invoice.notes && (
                  <FormSection title="Notes">
                    <DetailRow label="Notes" value={invoice.notes} />
                  </FormSection>
                )}

                <FormSection title="Entries">
                  {invoice.entries.length === 0 ? (
                    <p className="text-sm text-text-muted">No entries in this invoice.</p>
                  ) : (
                    <div className="divide-y divide-black/5">
                      {invoice.entries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <FinancialEntryTypeChip entryType={entry.entryType} />
                            <span className="text-sm text-text-primary">{entry.appointmentCode}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className="text-sm font-semibold"
                              style={{
                                color: entry.amount >= 0 ? 'var(--color-money-positive)' : 'var(--color-money-negative)',
                              }}
                            >
                              {entry.amount.toLocaleString('en-AU', { style: 'currency', currency: entry.currency })}
                            </span>
                            <FinancialStatusChip status={entry.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </FormSection>

                <FormSection title="Record">
                  <DetailRow label="Created at" value={formatDateTime(invoice.createdAt)} />
                  <DetailRow label="Updated at" value={formatDateTime(invoice.updatedAt)} />
                </FormSection>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </DrawerPanel>
  );
}
