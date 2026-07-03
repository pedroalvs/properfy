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

const summaryResponse = {
  currency: 'AUD',
  totalApproved: 150,
  nextPayment: 90,
  monthly: [
    { month: '2026-02', total: 0 },
    { month: '2026-03', total: 150 },
  ],
};

function payoutsPage(page: number, totalPages: number, entries: unknown[]) {
  return {
    data: entries,
    pagination: { page, pageSize: 20, total: totalPages * 20, totalPages },
  };
}

const marchEntries = [
  { id: 'e1', entryType: 'INSPECTOR_PAYOUT', amount: 150, currency: 'AUD', status: 'APPROVED', effectiveAt: '2026-03-10T10:00:00Z' },
  { id: 'e2', entryType: 'INSPECTOR_PAYOUT', amount: 90, currency: 'AUD', status: 'PENDING', effectiveAt: '2026-03-20T10:00:00Z' },
];

describe('EarningsPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 'usr-1', name: 'Inspector Jane', email: 'jane@test.com', role: 'INSP', tenantId: null },
    });

    mockGet.mockImplementation(async (path: string, opts?: { params?: { query?: Record<string, string> } }) => {
      if (path === '/v1/inspector/earnings/summary') {
        return { data: summaryResponse };
      }
      if (path === '/v1/financial/entries') {
        const query = opts?.params?.query ?? {};
        if (query.fromDate === '2026-04-01') return { data: payoutsPage(1, 1, []) };
        return { data: payoutsPage(Number(query.page ?? '1'), 1, marchEntries) };
      }
      return { data: undefined };
    });
  });

  it('shows the Earnings segment with next-payment, total, chart and invoice CTAs from the summary endpoint', async () => {
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

    expect(mockGet).toHaveBeenCalledWith(
      '/v1/inspector/earnings/summary',
      expect.objectContaining({ params: { query: { months: '6' } } }),
    );
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

  it('applies the date filter server-side (fromDate/toDate query params)', async () => {
    renderWithProviders(<EarningsPage />);
    await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-04-01' } });

    await waitFor(() => {
      expect(screen.getByText('No payouts for this period.')).toBeInTheDocument();
    });
    expect(mockGet).toHaveBeenCalledWith(
      '/v1/financial/entries',
      expect.objectContaining({
        params: { query: expect.objectContaining({ fromDate: '2026-04-01', type: 'INSPECTOR_PAYOUT', pageSize: '20' }) },
      }),
    );
  });

  it('loads the next page via the Load more button when more pages exist', async () => {
    mockGet.mockImplementation(async (path: string, opts?: { params?: { query?: Record<string, string> } }) => {
      if (path === '/v1/inspector/earnings/summary') return { data: summaryResponse };
      const page = Number(opts?.params?.query?.page ?? '1');
      if (page === 1) return { data: payoutsPage(1, 2, marchEntries) };
      return {
        data: payoutsPage(2, 2, [
          { id: 'e3', entryType: 'INSPECTOR_PAYOUT', amount: 55, currency: 'AUD', status: 'APPROVED', effectiveAt: '2026-02-05T10:00:00Z' },
        ]),
      };
    });

    renderWithProviders(<EarningsPage />);
    await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('history-load-more'));

    await waitFor(() => {
      expect(screen.getByText(/55\.00/)).toBeInTheDocument();
    });
    // Both pages remain rendered (appended, not replaced).
    expect(screen.getByText(/150\.00/)).toBeInTheDocument();
    expect(screen.queryByTestId('history-load-more')).not.toBeInTheDocument();
  });

  it('auto-loads the next page when the sentinel becomes visible (IntersectionObserver)', async () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback) {
        observerCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
      takeRecords = vi.fn();
      root = null;
      rootMargin = '';
      thresholds = [];
    });

    try {
      mockGet.mockImplementation(async (path: string, opts?: { params?: { query?: Record<string, string> } }) => {
        if (path === '/v1/inspector/earnings/summary') return { data: summaryResponse };
        const page = Number(opts?.params?.query?.page ?? '1');
        if (page === 1) return { data: payoutsPage(1, 2, marchEntries) };
        return {
          data: payoutsPage(2, 2, [
            { id: 'e3', entryType: 'INSPECTOR_PAYOUT', amount: 55, currency: 'AUD', status: 'APPROVED', effectiveAt: '2026-02-05T10:00:00Z' },
          ]),
        };
      });

      renderWithProviders(<EarningsPage />);
      await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('tab', { name: /history/i }));
      await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());
      expect(observe).toHaveBeenCalled();

      // Simulate the sentinel entering the viewport.
      observerCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);

      await waitFor(() => {
        expect(screen.getByText(/55\.00/)).toBeInTheDocument();
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows an inline retry when loading the next page fails, keeping the list visible', async () => {
    let failNextPage = true;
    mockGet.mockImplementation(async (path: string, opts?: { params?: { query?: Record<string, string> } }) => {
      if (path === '/v1/inspector/earnings/summary') return { data: summaryResponse };
      const page = Number(opts?.params?.query?.page ?? '1');
      if (page === 1) return { data: payoutsPage(1, 2, marchEntries) };
      if (failNextPage) return { error: { error: { code: 'INTERNAL_ERROR', message: 'boom' } } };
      return {
        data: payoutsPage(2, 2, [
          { id: 'e3', entryType: 'INSPECTOR_PAYOUT', amount: 55, currency: 'AUD', status: 'APPROVED', effectiveAt: '2026-02-05T10:00:00Z' },
        ]),
      };
    });

    renderWithProviders(<EarningsPage />);
    await waitFor(() => expect(screen.getByText('Earnings')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));
    await waitFor(() => expect(screen.getByText('Payment history')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('history-load-more'));

    await waitFor(() => {
      expect(screen.getByTestId('history-load-more-error')).toBeInTheDocument();
    });
    // Page-1 entries stay rendered despite the failed next page.
    expect(screen.getByText(/150\.00/)).toBeInTheDocument();

    // Retry succeeds and appends page 2.
    failNextPage = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText(/55\.00/)).toBeInTheDocument();
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
