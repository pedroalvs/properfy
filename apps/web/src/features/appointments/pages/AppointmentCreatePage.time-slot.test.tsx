import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import type * as SnackbarModule from '@/hooks/useSnackbar';
import { AppointmentCreatePage } from './AppointmentCreatePage';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: null },
  }),
}));

vi.mock('@/hooks/useSnackbar', async () => {
  const actual = await vi.importActual<typeof SnackbarModule>('@/hooks/useSnackbar');
  return {
    ...actual,
    useSnackbar: () => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    }),
  };
});

const mockSave = vi.fn();
// `validate` returns no errors so the test isolates the form's own past-time
// guard (which lives in handleSubmit, NOT in the shared Zod schema).
vi.mock('../hooks/useAppointmentSave', () => ({
  useAppointmentSave: () => ({
    save: mockSave,
    isSaving: false,
    validate: () => ({}),
  }),
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (queryKey: unknown[]) => {
    const [resource] = queryKey;
    if (resource === 'tenants') {
      return { options: [{ value: 'tenant-1', label: 'Agency One' }], isLoading: false };
    }
    if (resource === 'branches') {
      return { options: [{ value: 'branch-1', label: 'Branch One' }], isLoading: false };
    }
    if (resource === 'service-types') {
      return { options: [{ value: 'service-1', label: 'Routine Inspection' }], isLoading: false };
    }
    return { options: [], isLoading: false };
  },
}));

function createWrapper() {
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
          <MemoryRouter initialEntries={['/appointments/new']}>
            {children}
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

function selectOption(label: string, optionText: string) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByText(optionText));
}

describe('AppointmentCreatePage past-time guard', () => {
  beforeEach(() => {
    mockSave.mockReset();
    // Pin the clock at midday SYDNEY time (02:00Z = 12:00 AEST) so "today" and
    // "now" are deterministic in the platform timezone and a 09:00 start is
    // unambiguously in the past for today's date.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-06-15T02:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a past start time on today with an inline error on timeSlotStart (no save)', () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AppointmentCreatePage />
      </Wrapper>,
    );

    selectOption('Agency', 'Agency One');

    // Today's date with a start time that has already passed (09:00 < 12:00).
    fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: '2030-06-15' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Appointment' }));

    expect(screen.getByText('Start time is in the past')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('allows a future start time on today (no inline error, save proceeds)', () => {
    mockSave.mockResolvedValue({ success: true, id: 'apt-new' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AppointmentCreatePage />
      </Wrapper>,
    );

    selectOption('Agency', 'Agency One');

    fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: '2030-06-15' } });
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '15:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '17:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Appointment' }));

    expect(screen.queryByText('Start time is in the past')).not.toBeInTheDocument();
    expect(mockSave).toHaveBeenCalled();
  });
});
