import { useNavigate } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { useMyInvoices } from '../hooks/useInspectorInvoices';
import { invoiceStatusBadge, formatInvoiceCurrency } from '../lib/invoiceStatus';

export function InvoiceListScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useMyInvoices();
  const invoices = data?.data ?? [];

  return (
    <div className="w-full" data-testid="invoice-list-screen">
      <TopBar title="My Invoices" showBack backTo="/earnings" />

      <div className="flex flex-col gap-3 p-4">
        {isLoading && (
          <>
            <div className="h-20 animate-pulse rounded-[20px] bg-gray-100" />
            <div className="h-20 animate-pulse rounded-[20px] bg-gray-100" />
          </>
        )}

        {isError && (
          <div className="rounded-[24px] bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-text-secondary">Unable to load invoices.</p>
            <button type="button" onClick={() => refetch()} className="mt-3 text-sm font-semibold text-primary">
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && invoices.length === 0 && (
          <div className="rounded-[24px] bg-white p-6 text-center shadow-sm" data-testid="invoice-list-empty">
            <i className="mdi mdi-file-document-outline text-[40px] text-text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm text-text-secondary">You have no invoices yet.</p>
          </div>
        )}

        {invoices.map((inv) => {
          const badge = invoiceStatusBadge(inv.status);
          return (
            <button
              key={inv.id}
              type="button"
              onClick={() => navigate(`/earnings/invoices/${inv.id}`)}
              className="flex w-full items-center justify-between rounded-[20px] border border-black/[0.06] bg-white px-4 py-3.5 text-left shadow-sm"
              data-testid="invoice-list-item"
            >
              <div>
                <p className="text-sm font-semibold text-text-primary">{inv.invoiceNumberDisplay ?? 'Awaiting number'}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{inv.periodStart} → {inv.periodEnd}</p>
                <p className="mt-1 text-base font-bold text-text-primary">{formatInvoiceCurrency(inv.totalAmount, inv.currency)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                {inv.status === 'PAID' && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">Paid</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
