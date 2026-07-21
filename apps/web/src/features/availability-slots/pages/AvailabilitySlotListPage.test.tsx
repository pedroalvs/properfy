import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { AvailabilitySlotListPage } from './AvailabilitySlotListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SLOTS = [
  {
    id: 'slot-01',
    inspectorId: 'insp-01',
    inspectorName: 'Diego',
    date: '2026-03-20',
    startTime: '08:00',
    endTime: '12:00',
    region: 'North Zone',
    capacity: 3,
    bookedCount: 1,
    status: 'AVAILABLE',
    createdAt: '2026-03-17T10:00:00Z',
  },
  {
    id: 'slot-02',
    inspectorId: 'insp-02',
    inspectorName: 'Carlos',
    date: '2026-03-21',
    startTime: '13:00',
    endTime: '17:00',
    region: 'South Zone',
    capacity: 2,
    bookedCount: 2,
    status: 'BOOKED',
    createdAt: '2026-03-17T11:00:00Z',
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>{children}</SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_SLOTS,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <AvailabilitySlotListPage />
    </Wrapper>,
  );
}

describe('AvailabilitySlotListPage', () => {
  it('renders page title "Availability Slots"', () => {
    renderPage();
    expect(screen.getByText('Availability Slots')).toBeInTheDocument();
  });

  it('shows "New Slot" CTA button', () => {
    renderPage();
    expect(screen.getByText('New Slot')).toBeInTheDocument();
  });

  it('renders table view by default', () => {
    renderPage();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument();
  });

  it('shows view toggle buttons', () => {
    renderPage();
    expect(screen.getByLabelText('Table view')).toBeInTheDocument();
    expect(screen.getByLabelText('Calendar view')).toBeInTheDocument();
  });

  it('renders data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Diego')).toBeInTheDocument();
      expect(screen.getByText('Carlos')).toBeInTheDocument();
    });
  });
});
