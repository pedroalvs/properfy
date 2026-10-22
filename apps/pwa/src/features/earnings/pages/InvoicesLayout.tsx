import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { TwoPaneLayout } from '@/components/shell/TwoPaneLayout';
import { InvoiceListPage } from './InvoiceListPage';

/**
 * Invoices route layout. Phone keeps the validated list → detail stack. At the tablet breakpoint the
 * invoice list fills the width until one is selected, then the invoice detail (lines / total / PDF)
 * expands in from the left while the list stays mounted as a rail on the right; the close control or a
 * back navigation collapses it. Mirrors ScheduleLayout.
 */
export function InvoicesLayout() {
  const navigate = useNavigate();
  const hasSelection = useMatch('/earnings/invoices/:invoiceId') !== null;

  return (
    <TwoPaneLayout
      fillHeight
      master={<InvoiceListPage />}
      detail={<Outlet />}
      hasSelection={hasSelection}
      onClose={() => navigate('/earnings/invoices', { replace: true })}
    />
  );
}
