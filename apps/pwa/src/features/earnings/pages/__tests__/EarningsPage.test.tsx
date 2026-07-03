import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { EarningsPage } from '../EarningsPage';
import { api } from '@/services/api';

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const mockGet = api.GET as ReturnType<typeof vi.fn>;

describe('EarningsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'usr-1', name: 'Inspector Jane', email: 'jane@test.com', role: 'INSP', tenantId: null },
    });

    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: 'e1', entryType: 'INSPECTOR_PAYOUT', amount: 150, currency: 'AUD', status: 'APPROVED', effectiveAt: '2026-03-10T10:00:00Z' },
          { id: 'e2', entryType: 'INSPECTOR_PAYOUT', amount: 90, currency: 'AUD', status: 'PENDING', effectiveAt: '2026-03-20T10:00:00Z' },
        ],
        pagination: { page: 1, pageSize: 200, total: 2, totalPages: 1 },
      },
    });
  });

  it('shows the Earnings segment with next-payment, total, chart and invoice CTAs', async () => {
    renderWithProviders(<EarningsPage />);

    await waitFor(() => {
      expect(screen.getByText('Earnings')).toBeInTheDocument();
      // Total with Properfy = all-time approved (150); Next payment = pending (90)
      expect(screen.getByTestId('total-earnings-card')).toHaveTextContent(/150\.00/);
      expect(screen.getByTestId('next-payment-card')).toHaveTextContent(/90\.00/);
    });
    expect(screen.getByTestId('earnings-chart')).toBeInTheDocument();
    expect(screen.getByTestId('request-invoice-cta')).toBeInTheDocument();
    expect(screen.getByTestId('my-invoices-cta')).toBeInTheDocument();
  });

  it('switches to the History segment showing payouts with payment-status chips', async () => {
    renderWithProviders(<EarningsPage />);

    await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByText('Payment history')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
    // The invoice CTAs belong to the Earnings segment only.
    expect(screen.queryByTestId('request-invoice-cta')).not.toBeInTheDocument();
  });

  it('filters the history by date range', async () => {
    renderWithProviders(<EarningsPage />);
    await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());

    // Narrow to a window that excludes both entries (they are in March 2026).
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-04-01' } });

    await waitFor(() => {
      expect(screen.getByText('No payouts for this period.')).toBeInTheDocument();
    });
  });

  it('opens the native picker when a date filter input is clicked', async () => {
    renderWithProviders(<EarningsPage />);
    await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());

    for (const name of ['From date', 'To date']) {
      const input = screen.getByLabelText(name) as HTMLInputElement;
      const showPickerSpy = vi.fn();
      input.showPicker = showPickerSpy;
      fireEvent.click(input);
      expect(showPickerSpy).toHaveBeenCalledTimes(1);
    }
  });

  it('is safe when showPicker is undefined (older browsers)', async () => {
    renderWithProviders(<EarningsPage />);
    await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());

    // showPicker is undefined by default in jsdom — should not throw
    expect(() => fireEvent.click(screen.getByLabelText('From date'))).not.toThrow();
    expect(() => fireEvent.click(screen.getByLabelText('To date'))).not.toThrow();
  });
});
