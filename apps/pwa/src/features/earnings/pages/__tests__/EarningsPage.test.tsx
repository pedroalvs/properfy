import { screen, waitFor } from '@testing-library/react';
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
          {
            id: 'entry-1',
            entryType: 'INSPECTOR_PAYOUT',
            amount: 150,
            currency: 'AUD',
            status: 'APPROVED',
            effectiveAt: '2026-03-10T10:00:00Z',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 100,
          total: 1,
          totalPages: 1,
        },
      },
    });
  });

  it('renders approved earnings from the real paginated contract', async () => {
    renderWithProviders(<EarningsPage />);

    await waitFor(() => {
      expect(screen.getByText('Earnings')).toBeInTheDocument();
      expect(screen.getAllByText(/A?\$\s*150\.00/).length).toBeGreaterThan(0);
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });
  });
});
