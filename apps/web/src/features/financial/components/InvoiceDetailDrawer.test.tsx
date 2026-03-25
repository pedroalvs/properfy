import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useInvoiceDetail', () => ({
  useInvoiceDetail: vi.fn(),
}));

vi.mock('../hooks/useInvoiceDownload', () => ({
  useInvoiceDownload: vi.fn(() => ({ download: vi.fn(), isDownloading: false })),
}));

import { useInvoiceDetail } from '../hooks/useInvoiceDetail';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';

const mockUseInvoiceDetail = useInvoiceDetail as ReturnType<typeof vi.fn>;

describe('InvoiceDetailDrawer', () => {
  it('renders nothing when closed', () => {
    mockUseInvoiceDetail.mockReturnValue({ invoice: null, isLoading: false, isError: false, refetch: vi.fn() });
    const { container } = render(
      <InvoiceDetailDrawer invoiceId={null} open={false} onClose={vi.fn()} />,
    );
    expect(container.querySelector('[data-testid="drawer-panel"]')).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    mockUseInvoiceDetail.mockReturnValue({ invoice: null, isLoading: true, isError: false, refetch: vi.fn() });
    render(
      <InvoiceDetailDrawer invoiceId="inv-01" open={true} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders invoice details when loaded', () => {
    mockUseInvoiceDetail.mockReturnValue({
      invoice: {
        id: 'inv-01',
        inspectorId: 'insp-01',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        periodType: 'BIWEEKLY',
        totalAmount: 1800,
        currency: 'AUD',
        status: 'CLOSED',
        fileKey: 'invoices/inv-01.pdf',
        generatedAt: '2026-03-16T10:00:00Z',
        paidAt: null,
        notes: null,
        createdAt: '2026-03-16T10:00:00Z',
        updatedAt: '2026-03-16T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <InvoiceDetailDrawer invoiceId="inv-01" open={true} onClose={vi.fn()} resolveInspectorLabel={() => 'Diego'} />,
    );
    expect(screen.getByText('Invoice - Diego')).toBeInTheDocument();
    expect(screen.getByText('Biweekly')).toBeInTheDocument();
    expect(screen.getByText(/01\/03\/2026 - 15\/03\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('shows an open-invoice warning and disables download when the invoice is still open', () => {
    mockUseInvoiceDetail.mockReturnValue({
      invoice: {
        id: 'inv-02',
        inspectorId: 'insp-02',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        periodType: 'BIWEEKLY',
        totalAmount: 1800,
        currency: 'AUD',
        status: 'OPEN',
        fileKey: null,
        generatedAt: null,
        paidAt: null,
        notes: null,
        createdAt: '2026-03-16T10:00:00Z',
        updatedAt: '2026-03-16T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <InvoiceDetailDrawer invoiceId="inv-02" open={true} onClose={vi.fn()} resolveInspectorLabel={() => 'Carlos'} />,
    );

    expect(screen.getByText('This invoice is still open. The total can change until the invoice is closed.')).toBeInTheDocument();
    expect(screen.getByLabelText('Download invoice')).toBeDisabled();
  });
});
