import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { RequestInvoiceScreen } from '../RequestInvoiceScreen';
import { api } from '@/services/api';

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

const PERIODS = {
  billingCycle: 'FORTNIGHTLY',
  periods: [
    { periodType: 'FORTNIGHTLY', periodStart: '2026-06-29', periodEnd: '2026-07-12' },
    { periodType: 'FORTNIGHTLY', periodStart: '2026-06-15', periodEnd: '2026-06-28' },
  ],
};

describe('RequestInvoiceScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((path: string) => {
      if (path.includes('available-periods')) return Promise.resolve({ data: PERIODS });
      if (path.includes('preview')) {
        return Promise.resolve({ data: { periodType: 'FORTNIGHTLY', periodStart: '2026-06-29', periodEnd: '2026-07-12', payoutCount: 3, totalAmount: 1050, currency: 'AUD' } });
      }
      return Promise.resolve({ data: {} });
    });
    mockPost.mockResolvedValue({
      data: { invoiceId: 'inv-1', status: 'PENDING_REVIEW', totalAmount: 1050, currency: 'AUD', payoutCount: 3, periodStart: '2026-06-29', periodEnd: '2026-07-12' },
    });
  });

  it('lists closed periods, previews a selection, and submits a request', async () => {
    renderWithProviders(<RequestInvoiceScreen />);

    // Closed periods load.
    await waitFor(() => expect(screen.getAllByTestId('period-option')).toHaveLength(2));

    // Select the first period → preview loads.
    fireEvent.click(screen.getAllByTestId('period-option')[0]);
    await waitFor(() => expect(screen.getByTestId('request-invoice-preview')).toHaveTextContent(/1,?050/));
    expect(screen.getByTestId('request-invoice-preview')).toHaveTextContent(/3 approved payouts/);

    // Request the invoice → success card.
    fireEvent.click(screen.getByRole('button', { name: /^Request Invoice$/ }));
    await waitFor(() => expect(screen.getByTestId('request-invoice-success')).toBeInTheDocument());
    expect(mockPost).toHaveBeenCalled();
  });

  it('shows a friendly error when the period has no approved payouts', async () => {
    // openapi-fetch surfaces a 4xx as a resolved { error: <envelope> }, not a rejection.
    mockPost.mockResolvedValueOnce({ error: { error: { code: 'INVOICE_EMPTY_PERIOD', message: 'empty' } } });
    renderWithProviders(<RequestInvoiceScreen />);

    await waitFor(() => expect(screen.getAllByTestId('period-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId('period-option')[0]);
    // Wait for the preview DATA (not just the skeleton) so the Request button is enabled.
    await waitFor(() => expect(screen.getByTestId('request-invoice-preview')).toHaveTextContent(/3 approved payouts/));
    fireEvent.click(screen.getByRole('button', { name: /^Request Invoice$/ }));

    await waitFor(() => expect(screen.getByTestId('request-invoice-error')).toHaveTextContent(/No approved payouts/));
  });
});
