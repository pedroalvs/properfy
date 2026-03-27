import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@properfy/shared', () => ({
  contactSchema: { shape: { primaryEmail: { safeParse: () => ({ success: true }) } } },
  AppointmentStatus: { DRAFT: 'DRAFT', SCHEDULED: 'SCHEDULED', AWAITING_INSPECTOR: 'AWAITING_INSPECTOR', DONE: 'DONE', CANCELLED: 'CANCELLED', REJECTED: 'REJECTED' },
  TenantConfirmationStatus: { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', UNAVAILABLE: 'UNAVAILABLE', NO_RESPONSE: 'NO_RESPONSE' },
}));
vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
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
vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-1', name: 'Admin', email: 'admin@test.com', role: 'AM', tenantId: 't-1' },
    token: 'mock-token', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseFormOptions = vi.fn((..._args: unknown[]) => ({ options: [], isLoading: false }));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (...args: unknown[]) => mockUseFormOptions(...args),
}));

vi.mock('@/features/properties/components/PropertyFormDrawer', () => ({
  PropertyFormDrawer: ({ open }: { open: boolean }) => (open ? <div>Property Drawer</div> : null),
}));

const mockSave = vi.fn();
const mockValidate = vi.fn();

vi.mock('../hooks/useAppointmentSave', () => ({
  useAppointmentSave: () => ({
    save: mockSave,
    isSaving: false,
    validate: mockValidate,
  }),
}));

vi.mock('../hooks/useTimeSlotOptions', () => ({
  useTimeSlotOptions: () => ({
    options: [{ label: 'Morning (09:00 - 12:00)', value: '09:00-12:00' }],
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Stable reference to prevent infinite re-render in useEffect
const MOCK_APPOINTMENT = {
  id: 'apt-01', branchId: 'branch-1', propertyId: 'prop-1', serviceTypeId: 'st-1',
  scheduledDate: '2026-04-01', timeSlot: '09:00-12:00', contactName: 'John Doe',
  contactPhone: '11999999999', contactEmail: 'john@test.com', keyRequired: true,
  meetingLocation: 'Lobby', keyLocation: 'Portaria', notes: 'Test notes',
  restrictions: [{ id: 'res-1', isHome: true, unavailableDaysJson: null, unavailableHoursJson: null, notes: 'Ring bell', source: 'OPERATOR' }],
};

vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    if (!id) return { appointment: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { appointment: MOCK_APPOINTMENT, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { AppointmentFormDrawer } from './AppointmentFormDrawer';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderDrawer(props: Partial<Parameters<typeof AppointmentFormDrawer>[0]> = {}) {
  return render(
    <AppointmentFormDrawer
      open={props.open ?? true}
      onClose={props.onClose ?? vi.fn()}
      appointmentId={props.appointmentId ?? undefined}
      onSaved={props.onSaved ?? vi.fn()}
    />,
    { wrapper: createWrapper() },
  );
}

describe('AppointmentFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
    mockUseFormOptions.mockImplementation(() => ({ options: [], isLoading: false }));
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
    expect(screen.getByText('Create Appointment')).toBeInTheDocument();
    expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    expect(screen.getByText('Tenant Contact')).toBeInTheDocument();
    expect(screen.getByText('Access & Key')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    expect(screen.getByText('Edit Appointment')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByLabelText('Tenant Name')).toHaveValue('John Doe');
    expect(screen.getByLabelText('Phone')).toHaveValue('11999999999');
    expect(screen.getByLabelText('Email')).toHaveValue('john@test.com');
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ contactName: 'Required field' });
    renderDrawer();
    fireEvent.click(screen.getByText('Create Appointment'));
    expect(screen.getByText('Required field')).toBeInTheDocument();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('filters properties by branch in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });

    const latestPropertyCall = mockUseFormOptions.mock.calls
      .filter((call) => call[1] === '/v1/properties')
      .at(-1);

    expect((latestPropertyCall as unknown[] | undefined)?.[3]).toEqual({ branchId: 'branch-1' });
  });

  it('allows editing the time slot in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    expect(screen.getByLabelText('Time Slot')).not.toBeDisabled();
  });
});
