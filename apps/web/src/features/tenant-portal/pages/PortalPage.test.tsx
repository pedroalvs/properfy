import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { apiClient, ApiError } from '@/lib/api-client';
import { PortalPage } from './PortalPage';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_PORTAL_DATA = {
  token: { status: 'ACTIVE', isReadOnly: false },
  appointment: {
    id: 'apt-1',
    status: 'SCHEDULED',
    scheduledDate: '2026-04-15',
    timeSlot: '09:00-11:00',
    serviceTypeId: 'svc-1',
    tenantConfirmationStatus: 'PENDING',
    keyRequired: false,
    meetingLocation: null,
    notes: null,
  },
  contact: {
    tenantName: 'John Tenant',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
  },
  restrictions: null,
};

function createWrapper(initialPath: string = '/portal/test-token') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/portal/:token" element={children} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
});

function renderPortal(path?: string) {
  const Wrapper = createWrapper(path);
  return render(
    <Wrapper>
      <PortalPage />
    </Wrapper>,
  );
}

describe('PortalPage', () => {
  it('shows loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    renderPortal();
    // Should show skeleton placeholders
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders appointment details on successful load', async () => {
    mockGet.mockResolvedValue(MOCK_PORTAL_DATA);
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    });
    expect(screen.getByText('09:00-11:00')).toBeInTheDocument();
  });

  it('shows confirm section when status is PENDING', async () => {
    mockGet.mockResolvedValue(MOCK_PORTAL_DATA);
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Confirm Your Attendance')).toBeInTheDocument();
    });
  });

  it('shows read-only banner when token is expired', async () => {
    mockGet.mockResolvedValue({
      ...MOCK_PORTAL_DATA,
      token: { status: 'EXPIRED', isReadOnly: true },
    });
    renderPortal();

    await waitFor(() => {
      expect(
        screen.getByText(/The confirmation deadline has passed/),
      ).toBeInTheDocument();
    });
  });

  it('shows terminal state banner when appointment is DONE', async () => {
    mockGet.mockResolvedValue({
      ...MOCK_PORTAL_DATA,
      appointment: { ...MOCK_PORTAL_DATA.appointment, status: 'DONE' },
    });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText(/done/i)).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    mockGet.mockRejectedValue(new ApiError(404, 'Not found', 'PORTAL_TOKEN_NOT_FOUND'));
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Invalid Link')).toBeInTheDocument();
    });
  });

  it('renders contact form with pre-filled data', async () => {
    mockGet.mockResolvedValue(MOCK_PORTAL_DATA);
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Contact Information')).toBeInTheDocument();
    });
    expect(screen.getByText('John Tenant')).toBeInTheDocument();
  });

  it('shows reschedule form when not read-only and not terminal', async () => {
    mockGet.mockResolvedValue(MOCK_PORTAL_DATA);
    renderPortal();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Request Reschedule' })).toBeInTheDocument();
    });
  });

  it('hides reschedule form when read-only', async () => {
    mockGet.mockResolvedValue({
      ...MOCK_PORTAL_DATA,
      token: { status: 'EXPIRED', isReadOnly: true },
    });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    });
    expect(screen.queryByText('Request Reschedule')).not.toBeInTheDocument();
  });

  it('shows unavailability section when confirmation is PENDING', async () => {
    mockGet.mockResolvedValue(MOCK_PORTAL_DATA);
    renderPortal();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Report Unavailability' })).toBeInTheDocument();
    });
  });

  it('hides confirm section when already CONFIRMED', async () => {
    mockGet.mockResolvedValue({
      ...MOCK_PORTAL_DATA,
      appointment: {
        ...MOCK_PORTAL_DATA.appointment,
        tenantConfirmationStatus: 'CONFIRMED',
      },
    });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Attendance Confirmed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Confirm Your Attendance')).not.toBeInTheDocument();
  });
});
