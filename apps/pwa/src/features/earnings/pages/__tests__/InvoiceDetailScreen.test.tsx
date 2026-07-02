import { screen } from '@testing-library/react';
import type * as RRD from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { InvoiceDetailScreen } from '../InvoiceDetailScreen';

const mockUseMyInvoiceDetail = vi.fn();

vi.mock('../../hooks/useInspectorInvoices', () => ({
  useMyInvoiceDetail: () => mockUseMyInvoiceDetail(),
  downloadInvoice: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RRD>();
  return { ...actual, useParams: () => ({ invoiceId: 'inv-1' }) };
});

function detail(overrides = {}) {
  return {
    data: {
      data: {
        id: 'inv-1',
        invoiceNumberDisplay: 'PINV-000010',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-14',
        totalAmount: 900,
        currency: 'AUD',
        status: 'CLOSED',
        fileKey: 'invoices/inv-1.pdf',
        notes: null,
        lineItemsSnapshot: [
          { appointmentCode: 'ABC-0001', propertyAddress: '1 Test St', serviceType: 'Routine', serviceDate: '2026-06-03', agencyName: 'Agency One', branchName: 'Branch A', amount: 900 },
        ],
        ...overrides,
      },
    },
    isLoading: false,
    isError: false,
  };
}

describe('InvoiceDetailScreen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an approved invoice with number, total, line items and an enabled Download button', () => {
    mockUseMyInvoiceDetail.mockReturnValue(detail());
    renderWithProviders(<InvoiceDetailScreen />);

    expect(screen.getByText('PINV-000010')).toBeInTheDocument();
    expect(screen.getByText('ABC-0001')).toBeInTheDocument();
    expect(screen.getByText('1 Test St')).toBeInTheDocument();
    const download = screen.getByRole('button', { name: /Download PDF/ });
    expect(download).toBeEnabled();
  });

  it('shows the rejection reason and no Download button for a VOID invoice', () => {
    mockUseMyInvoiceDetail.mockReturnValue(
      detail({ status: 'VOID', fileKey: null, notes: 'Wrong period', invoiceNumberDisplay: null, lineItemsSnapshot: [] }),
    );
    renderWithProviders(<InvoiceDetailScreen />);

    expect(screen.getByText(/Rejected: Wrong period/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download PDF/ })).not.toBeInTheDocument();
  });
});
