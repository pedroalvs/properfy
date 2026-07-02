import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

import { api } from '@/services/api';
import { ApiError } from '@/lib/api-error';
import { PortalPage } from './PortalPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

const MOCK_PORTAL_DATA = {
  token: { status: 'ACTIVE', isReadOnly: false },
  appointment: {
    id: 'apt-1',
    status: 'SCHEDULED',
    scheduledDate: '2026-04-15',
    timeSlotStart: '09:00', timeSlotEnd: '11:00',
    serviceTypeId: 'svc-1',
    rentalTenantConfirmationStatus: 'PENDING',
    keyRequired: false,
    meetingLocation: null,
    notes: null,
  },
  contact: {
    rentalTenantName: 'John Tenant',
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
  mockPost.mockReset();
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
    mockGet.mockReturnValue(new Promise(() => { /* never resolves */ }));
    renderPortal();
    // Should show skeleton placeholders
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders appointment details on successful load', async () => {
    mockGet.mockResolvedValue({ data: MOCK_PORTAL_DATA });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    });
    expect(screen.getByText('09:00 - 11:00')).toBeInTheDocument();
  });

  it('shows confirm section when status is PENDING', async () => {
    mockGet.mockResolvedValue({ data: MOCK_PORTAL_DATA });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Do you confirm the inspection?')).toBeInTheDocument();
    });
  });

  it('shows read-only banner when token status is EXPIRED', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      token: { status: 'EXPIRED', isReadOnly: true },
    } });
    renderPortal();

    await waitFor(() => {
      expect(
        screen.getAllByText(/restricted mode/i).length,
      ).toBeGreaterThan(0);
    });
  });

  it('shows terminal state banner when appointment is DONE', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      appointment: { ...MOCK_PORTAL_DATA.appointment, status: 'DONE' },
    } });
    renderPortal();

    await waitFor(() => {
      const matches = screen.getAllByText(/done/i);
      expect(matches.length).toBeGreaterThan(0);
    });
    expect(screen.getByText('This portal is read-only. Contact updates are no longer available.')).toBeInTheDocument();
  });

  it('shows invalid view when API returns PORTAL_TOKEN_NOT_FOUND', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: new ApiError(404, 'Not found', 'PORTAL_TOKEN_NOT_FOUND') });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('This link is no longer valid')).toBeInTheDocument();
    });
  });

  it('shows invalid view when API returns PORTAL_TOKEN_INVALID', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: new ApiError(400, 'Invalid', 'PORTAL_TOKEN_INVALID') });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('This link is no longer valid')).toBeInTheDocument();
    });
  });

  it('shows expired view when API returns PORTAL_TOKEN_EXPIRED error', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: new ApiError(410, 'Expired', 'PORTAL_TOKEN_EXPIRED') });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('The confirmation deadline has passed. Contact the agency directly for any changes.')).toBeInTheDocument();
    });
  });

  it('shows cancelled view when appointment is CANCELLED', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      appointment: { ...MOCK_PORTAL_DATA.appointment, status: 'CANCELLED' },
      agencyPhone: '+61 2 1234 5678',
    } });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('This inspection has been cancelled')).toBeInTheDocument();
    });
    expect(screen.getByText('+61 2 1234 5678')).toBeInTheDocument();
  });

  it('renders contact form with pre-filled data', async () => {
    mockGet.mockResolvedValue({ data: MOCK_PORTAL_DATA });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Contact Information')).toBeInTheDocument();
    });
    expect(screen.getByText('John Tenant')).toBeInTheDocument();
  });

  it('shows reschedule form when not read-only and not terminal', async () => {
    mockGet.mockResolvedValue({ data: MOCK_PORTAL_DATA });
    renderPortal();

    // The RescheduleForm is now behind the "Propose new date" CTA button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Propose new date' })).toBeInTheDocument();
    });
  });

  it('hides reschedule form when token is expired (read-only)', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      token: { status: 'EXPIRED', isReadOnly: true },
    } });
    renderPortal();

    await waitFor(() => {
      expect(screen.getAllByText(/restricted mode/i).length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('heading', { name: 'Request Reschedule' })).not.toBeInTheDocument();
  });

  it('shows unavailability section when token is expired but confirmation is not CONFIRMED', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      token: { status: 'EXPIRED', isReadOnly: true },
    } });
    renderPortal();

    await waitFor(() => {
      expect(screen.getAllByText(/restricted mode/i).length).toBeGreaterThan(0);
    });
    // In the unified form, the No button (disabled when read-only) is the unavailability path
    expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument();
  });

  it('keeps unavailability available after cutoff even when a previous response exists', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      token: { status: 'EXPIRED', isReadOnly: true },
      appointment: {
        ...MOCK_PORTAL_DATA.appointment,
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
      existingResponse: {
        type: 'CONFIRMED',
        createdAt: '2026-04-10T10:00:00Z',
        summary: 'Confirmed by tenant',
      },
    } });
    renderPortal();

    // Urgent mode: even with CONFIRMED status + past cutoff, the unified form renders in read-only
    // so the tenant can use the No button for urgent unavailability reporting
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument();
    });
  });

  it('shows unavailability section when confirmation is PENDING', async () => {
    mockGet.mockResolvedValue({ data: MOCK_PORTAL_DATA });
    renderPortal();

    // The No button in the unified form is the unavailability path
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument();
    });
  });

  it('hides confirm section when already CONFIRMED', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      appointment: {
        ...MOCK_PORTAL_DATA.appointment,
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
    } });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Attendance Confirmed')).toBeInTheDocument();
    });
    // Unified form is not shown when already CONFIRMED and not in read-only mode
    expect(screen.queryByText('Do you confirm the inspection?')).not.toBeInTheDocument();
  });

  it('shows ResponseConfirmationCard when existingResponse is present', async () => {
    mockGet.mockResolvedValue({ data: {
      ...MOCK_PORTAL_DATA,
      existingResponse: {
        type: 'CONFIRMED',
        createdAt: '2026-04-10T10:00:00Z',
        summary: 'Confirmed by tenant',
      },
    } });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Confirmed')).toBeInTheDocument();
    });
    expect(screen.getByText('Confirmed by tenant')).toBeInTheDocument();
  });

  it('clicking "Propose new date" expands the reschedule form', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: MOCK_PORTAL_DATA });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Propose new date' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Propose new date' }));
    expect(screen.getByRole('button', { name: '← Back' })).toBeInTheDocument();
  });

  it('clicking "← Back" in propose new date panel collapses the form', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: MOCK_PORTAL_DATA });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Propose new date' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Propose new date' }));
    const backButton = screen.getByRole('button', { name: '← Back' });
    await user.click(backButton);
    expect(screen.getByRole('button', { name: 'Propose new date' })).toBeInTheDocument();
  });

  it('hides "Propose new date" when rescheduleAllowed is false', async () => {
    mockGet.mockResolvedValue({ data: { ...MOCK_PORTAL_DATA, rescheduleAllowed: false } });
    renderPortal();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Propose new date' })).not.toBeInTheDocument();
    });
  });

  it('shows a recoverable error when the selected time slot is no longer available', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((path: string) => {
      if (path.endsWith('/available-groups')) {
        return Promise.resolve({
          data: {
            groups: [
              {
                groupId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                scheduledDate: '2026-06-10',
                timeSlotStart: '09:00',
                timeSlotEnd: '10:00',
                suburb: 'Surry Hills',
                inspectorName: 'John Smith',
                confirmedCount: 3,
                capacityMax: 10,
              },
            ],
          },
        });
      }

      return Promise.resolve({ data: MOCK_PORTAL_DATA });
    });
    mockPost.mockResolvedValue({
      data: undefined,
      error: new ApiError(422, 'Slot unavailable', 'PORTAL_GROUP_SLOT_UNAVAILABLE'),
    });
    renderPortal();

    await user.click(await screen.findByRole('button', { name: 'Change time' }));
    await user.click(await screen.findByRole('button', { name: /Surry Hills/i }));
    await user.click(screen.getByRole('button', { name: 'Join this time slot' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This time slot is no longer available. Please pick another one.',
    );
    expect(screen.getByRole('button', { name: 'Join this time slot' })).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/rental-tenant-portal/test-token/join-group',
      {
        body: {
          groupId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          scheduledDate: '2026-06-10',
          timeSlotStart: '09:00',
          timeSlotEnd: '10:00',
        },
      },
    );
  });

  it('shows generic error state for unknown API errors', async () => {
    mockGet.mockResolvedValue({ data: undefined, error: new ApiError(500, 'Server error') });
    renderPortal();

    await waitFor(() => {
      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });
  });
});
