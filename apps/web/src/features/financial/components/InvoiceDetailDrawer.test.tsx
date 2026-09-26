import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createQueryWrapper } from '@/test-utils/test-wrappers';

vi.mock('../hooks/useInvoiceDetail', () => ({
  useInvoiceDetail: vi.fn(),
}));

vi.mock('../hooks/useInvoiceDownload', () => ({
  useInvoiceDownload: vi.fn(() => ({ download: vi.fn(), isDownloading: false })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
    messages: [],
    dismiss: vi.fn(),
  }),
}));

import { useInvoiceDetail } from '../hooks/useInvoiceDetail';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';

const mockUseInvoiceDetail = useInvoiceDetail as ReturnType<typeof vi.fn>;

describe('InvoiceDetailDrawer', () => {
  it('renders nothing when closed', () => {
    mockUseInvoiceDetail.mockReturnValue({ invoice: null, isLoading: false, isError: false, refetch: vi.fn() });
    const { container } = render(
      <InvoiceDetailDrawer invoiceId={null} open={false} onClose={vi.fn()} />,
      { wrapper: createQueryWrapper() },
    );
    expect(container.querySelector('[data-testid="drawer-panel"]')).not.toBeInTheDocument();
  });

  it('renders loading state', () => {
    mockUseInvoiceDetail.mockReturnValue({ invoice: null, isLoading: true, isError: false, refetch: vi.fn() });
    render(
      <InvoiceDetailDrawer invoiceId="inv-01" open={true} onClose={vi.fn()} />,
      { wrapper: createQueryWrapper() },
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
        invoiceNumber: null,        invoiceNumberDisplay: null,        periodType: 'FORTNIGHTLY',
        totalAmount: 1800,
        currency: 'AUD',
        status: 'CLOSED',
        fileKey: 'invoices/inv-01.pdf',
        issuedAt: '2026-03-16T10:00:00Z',
        paidAt: null,
        paidByUserId: null,
        paymentReference: null,
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
      { wrapper: createQueryWrapper() },
    );
    expect(screen.getByText('Invoice - Diego')).toBeInTheDocument();
    expect(screen.getByText('Fortnightly')).toBeInTheDocument();
    expect(screen.getByText(/01\/03\/2026 - 15\/03\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('disables download for a PENDING_REVIEW invoice (not yet issued)', () => {
    mockUseInvoiceDetail.mockReturnValue({
      invoice: {
        id: 'inv-02',
        inspectorId: 'insp-02',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        invoiceNumber: null,        invoiceNumberDisplay: null,        periodType: 'FORTNIGHTLY',
        totalAmount: 1800,
        currency: 'AUD',
        status: 'PENDING_REVIEW',
        fileKey: null,
        issuedAt: null,
        paidAt: null,
        paidByUserId: null,
        paymentReference: null,
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
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByLabelText('Download invoice')).toBeDisabled();
  });

  it('falls back to "Unknown inspector" when resolveInspectorLabel is missing, never showing the raw inspectorId', () => {
    mockUseInvoiceDetail.mockReturnValue({
      invoice: {
        id: 'inv-03',
        inspectorId: 'insp-03',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        invoiceNumber: null,        invoiceNumberDisplay: null,        periodType: 'FORTNIGHTLY',
        totalAmount: 1800,
        currency: 'AUD',
        status: 'CLOSED',
        fileKey: 'invoices/inv-03.pdf',
        issuedAt: '2026-03-16T10:00:00Z',
        paidAt: null,
        paidByUserId: null,
        paymentReference: null,
        notes: null,
        createdAt: '2026-03-16T10:00:00Z',
        updatedAt: '2026-03-16T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <InvoiceDetailDrawer invoiceId="inv-03" open={true} onClose={vi.fn()} />,
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByText('Invoice - Unknown inspector')).toBeInTheDocument();
    expect(screen.queryByText('insp-03')).not.toBeInTheDocument();
  });

  it('never renders the raw paidByUserId in the "Paid by" row for a PAID invoice', () => {
    mockUseInvoiceDetail.mockReturnValue({
      invoice: {
        id: 'inv-04',
        inspectorId: 'insp-04',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        invoiceNumber: null,        invoiceNumberDisplay: null,        periodType: 'FORTNIGHTLY',
        totalAmount: 1800,
        currency: 'AUD',
        status: 'PAID',
        fileKey: 'invoices/inv-04.pdf',
        issuedAt: '2026-03-16T10:00:00Z',
        paidAt: '2026-03-20T10:00:00Z',
        paidByUserId: 'usr-99999999-aaaa-bbbb-cccc-dddddddddddd',
        paymentReference: 'PAY-004',
        notes: null,
        createdAt: '2026-03-16T10:00:00Z',
        updatedAt: '2026-03-16T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <InvoiceDetailDrawer invoiceId="inv-04" open={true} onClose={vi.fn()} resolveInspectorLabel={() => 'Sam'} />,
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByText('Paid by')).toBeInTheDocument();
    expect(screen.queryByText('usr-99999999-aaaa-bbbb-cccc-dddddddddddd')).not.toBeInTheDocument();
  });
});
