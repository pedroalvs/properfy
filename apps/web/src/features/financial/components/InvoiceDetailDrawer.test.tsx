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
        periodType: 'FORTNIGHTLY',
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

  it('shows an open-invoice warning and disables download when the invoice is still open', () => {
    mockUseInvoiceDetail.mockReturnValue({
      invoice: {
        id: 'inv-02',
        inspectorId: 'insp-02',
        periodStart: '2026-03-01',
        periodEnd: '2026-03-15',
        periodType: 'FORTNIGHTLY',
        totalAmount: 1800,
        currency: 'AUD',
        status: 'OPEN',
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

    expect(screen.getByText('This invoice is still open. The total can change until the invoice is closed.')).toBeInTheDocument();
    expect(screen.getByLabelText('Download invoice')).toBeDisabled();
  });
});
