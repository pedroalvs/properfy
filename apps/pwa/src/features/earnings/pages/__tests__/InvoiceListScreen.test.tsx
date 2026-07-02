import { screen, fireEvent } from '@testing-library/react';
import type * as RRD from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { InvoiceListScreen } from '../InvoiceListScreen';

const mockUseMyInvoices = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../../hooks/useInspectorInvoices', () => ({
  useMyInvoices: () => mockUseMyInvoices(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RRD>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('InvoiceListScreen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders own invoices with status + Paid badge and navigates to detail on tap', () => {
    mockUseMyInvoices.mockReturnValue({
      data: {
        data: [
          { id: 'inv-1', invoiceNumberDisplay: 'PINV-000010', periodStart: '2026-06-01', periodEnd: '2026-06-14', totalAmount: 900, currency: 'AUD', status: 'PAID' },
          { id: 'inv-2', invoiceNumberDisplay: 'PINV-000011', periodStart: '2026-06-15', periodEnd: '2026-06-28', totalAmount: 400, currency: 'AUD', status: 'PENDING_REVIEW' },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<InvoiceListScreen />);

    expect(screen.getAllByTestId('invoice-list-item')).toHaveLength(2);
    expect(screen.getByText('PINV-000010')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument(); // complementary badge only on the PAID row

    fireEvent.click(screen.getAllByTestId('invoice-list-item')[0]);
    expect(mockNavigate).toHaveBeenCalledWith('/earnings/invoices/inv-1');
  });

  it('shows the empty state when the inspector has no invoices', () => {
    mockUseMyInvoices.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() });
    renderWithProviders(<InvoiceListScreen />);
    expect(screen.getByTestId('invoice-list-empty')).toBeInTheDocument();
  });
});
