import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';

vi.mock('@properfy/shared', () => ({
  contactSchema: { shape: { primaryEmail: { safeParse: () => ({ success: true }) } } },
  AppointmentStatus: { DRAFT: 'DRAFT', SCHEDULED: 'SCHEDULED', AWAITING_INSPECTOR: 'AWAITING_INSPECTOR', DONE: 'DONE', CANCELLED: 'CANCELLED', REJECTED: 'REJECTED' },
  AppointmentContactRole: { TENANT: 'RENTAL_TENANT', TENANT_REPRESENTATIVE: 'TENANT_REPRESENTATIVE', HOUSEKEEPER: 'HOUSEKEEPER', PROPERTY_MANAGER: 'PROPERTY_MANAGER', BROKER: 'BROKER', OTHER: 'OTHER' },
  RentalTenantConfirmationStatus: { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', UNAVAILABLE: 'UNAVAILABLE', NO_RESPONSE: 'NO_RESPONSE' },
  // 023 §FR-251 — inline contact form needs ContactType + ContactChannelType
  // when picking the registry-row type and adding additional channels.
  ContactType: { TENANT: 'RENTAL_TENANT', PROPERTY_MANAGER: 'PROPERTY_MANAGER', HOUSEKEEPER: 'HOUSEKEEPER', BROKER: 'BROKER', OTHER: 'OTHER' },
  ContactChannelType: { EMAIL: 'EMAIL', PHONE: 'PHONE' },
  todayLocalDateString: () => '2026-03-29',
  isTimeStartInPastForDate: () => false,
  validateEditedSchedule: () => ({ ok: true }),
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
// Loose typing: tests override role and tenantId (including null for cross-tenant OP).
type AuthMock = {
  user: { id: string; name: string; email: string; role: string; tenantId: string | null };
  token: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
};
const mockUseAuth = vi.fn<[], AuthMock>(() => ({
  user: { id: 'usr-1', name: 'Admin', email: 'admin@test.com', role: 'AM', tenantId: 't-1' },
  token: 'mock-token', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseFormOptions = vi.fn((..._args: unknown[]) => ({ options: [], isLoading: false }));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (...args: unknown[]) => mockUseFormOptions(...args),
}));

vi.mock('../hooks/useContactSearch', () => ({
  useContactSearch: () => ({
    search: '',
    debouncedSearch: '',
    results: [],
    isSearching: false,
    setSearch: vi.fn(),
    reset: vi.fn(),
  }),
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

// Stable reference to prevent infinite re-render in useEffect
const MOCK_APPOINTMENT = {
  id: 'apt-01', branchId: 'branch-1', propertyId: 'prop-1', serviceTypeId: 'st-1',
  scheduledDate: '2026-04-01', timeSlotStart: '09:00', timeSlotEnd: '12:00', contactName: 'John Doe',
  contactPhone: '11999999999', contactEmail: 'john@test.com', keyRequired: true,
  meetingLocation: 'Lobby', keyLocation: 'Portaria', notes: 'Test notes',
  status: 'AWAITING_INSPECTOR',
  inspectorId: null,
  restrictions: [{ id: 'res-1', isHome: true, unavailableDaysJson: null, unavailableHoursJson: null, notes: 'Ring bell', source: 'OPERATOR' }],
};

vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    if (!id) return { appointment: null, isLoading: false, isError: false, refetch: vi.fn() };
    return { appointment: MOCK_APPOINTMENT, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

import { AppointmentFormDrawer } from './AppointmentFormDrawer';

function SnackbarDisplay() {
  const { messages } = useSnackbar();
  return (
    <div data-testid="snackbar-display">
      {messages.map((m) => (
        <div key={m.id}>{m.message}</div>
      ))}
    </div>
  );
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <SnackbarProvider>
        {children}
        <SnackbarDisplay />
      </SnackbarProvider>
    </QueryClientProvider>
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
  const mockPost = api.POST as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ success: true });
    mockValidate.mockReturnValue({});
    mockUseFormOptions.mockImplementation(() => ({ options: [], isLoading: false }));
    mockPost.mockResolvedValue({ data: { data: { id: 'apt-01', status: 'SCHEDULED' } }, error: null });
    // Default to AM user; individual tests override (e.g., OP cross-tenant regression below).
    mockUseAuth.mockReturnValue({
      user: { id: 'usr-1', name: 'Admin', email: 'admin@test.com', role: 'AM', tenantId: 't-1' },
      token: 'mock-token', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
    });
  });

  it('renders create mode with correct title, form sections, and cancel calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
    expect(screen.getByText('Create Appointment')).toBeInTheDocument();
    expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    expect(screen.getByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('Access & Key')).toBeInTheDocument();
    expect(screen.getByText('Add Contact')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode with populated fields and correct buttons', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    expect(screen.getByText('Edit Appointment')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    // Contact fields are now in the contacts array sub-form
    // 023 §FR-252 — inline contact label was renamed Name → Display name to
    // match the dedicated /contacts form (cross-form parity).
    expect(screen.getByLabelText('Contact 1 Display name')).toHaveValue('John Doe');
    expect(screen.getByLabelText('Contact 1 Phone')).toHaveValue('11999999999');
    expect(screen.getByLabelText('Contact 1 Email')).toHaveValue('john@test.com');
  });

  it('shows validation errors and prevents save when validation fails', () => {
    mockValidate.mockReturnValue({ branchId: 'Required field' });
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

  it('allows editing the time slot (free start/end range) in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    const start = screen.getByLabelText('Start time') as HTMLInputElement;
    const end = screen.getByLabelText('End time') as HTMLInputElement;
    expect(start).not.toBeDisabled();
    expect(end).not.toBeDisabled();
    // Pre-populated from the loaded appointment's start/end.
    expect(start.value).toBe('09:00');
    expect(end.value).toBe('12:00');
  });

  it('shows inspector assignment section for awaiting inspector appointments', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/inspectors') {
        return { options: [{ value: 'insp-01', label: 'Inspector One' }], isLoading: false };
      }
      return { options: [], isLoading: false };
    }) as any);

    renderDrawer({ appointmentId: 'apt-01' });

    expect(screen.getByText('Assignment')).toBeInTheDocument();
    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
  });

  it('renders contact autocomplete search field in create mode', () => {
    renderDrawer();
    expect(screen.getByText('Search existing contact')).toBeInTheDocument();
    expect(screen.getByText(/Or fill in the fields below/)).toBeInTheDocument();
  });

  it('shows a user-friendly error and keeps drawer open when save returns APPOINTMENT_CONTACT_NOT_FOUND', async () => {
    // The backend ValidationError serializes the code string as the message field.
    mockSave.mockResolvedValue({
      success: false,
      error: 'APPOINTMENT_CONTACT_NOT_FOUND',
      errorCode: 'VALIDATION_ERROR',
    });

    const onSaved = vi.fn();
    renderDrawer({ onSaved });

    fireEvent.click(screen.getByText('Create Appointment'));

    await waitFor(() => {
      expect(screen.getByText(
        'One or more contacts belong to a different agency and cannot be linked to this appointment.',
      )).toBeInTheDocument();
    });

    // Drawer must remain open — onSaved must NOT be called
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('assigns inspector from the edit drawer via appointment transition', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/inspectors') {
        return { options: [{ value: 'insp-01', label: 'Inspector One' }], isLoading: false };
      }
      return { options: [], isLoading: false };
    }) as any);

    renderDrawer({ appointmentId: 'apt-01' });

    fireEvent.click(screen.getByLabelText('Inspector'));
    fireEvent.click(screen.getByText('Inspector One'));

    await waitFor(() => {
      expect(screen.getByText('Save & Assign Inspector')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save & Assign Inspector'));

    expect(mockSave).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith(
      '/v1/appointments/apt-01/status-transitions',
      {
        body: {
          targetStatus: 'SCHEDULED',
          inspectorId: 'insp-01',
        },
        headers: { 'Idempotency-Key': expect.any(String) },
      },
    );
  });

  it('opens the property-creation page in a new tab pre-filled with agency and branch (create mode)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/tenants') return { options: [{ value: 'tenant-1', label: 'Agency One' }], isLoading: false };
      if (path === '/v1/branches') return { options: [{ value: 'branch-9', label: 'Branch Nine' }], isLoading: false };
      return { options: [], isLoading: false };
    }) as any);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    renderDrawer();

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(screen.getByText('Branch Nine'));

    fireEvent.click(screen.getByText('Property not listed? Create one'));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = String(openSpy.mock.calls[0]?.[0]);
    const target = openSpy.mock.calls[0]?.[1];
    expect(url).toContain('/properties/new?');
    expect(url).toContain('tenantId=tenant-1');
    expect(url).toContain('branchId=branch-9');
    expect(target).toBe('_blank');

    openSpy.mockRestore();
  });

  it('does not render the create-property action in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    expect(screen.queryByText('Property not listed? Create one')).not.toBeInTheDocument();
  });

  // Regression: cross-tenant OP (tenantId=null in JWT) selects an agency in step 1
  // and the branches request must forward `tenantId=<selected>` so the new backend
  // resolution path returns that tenant's branches. Pre-fix: the request body was
  // built but the backend ignored it for OP, returning empty list.
  it('OP cross-tenant: selecting agency forwards tenantId to /v1/branches request', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'op-1', name: 'Operator', email: 'op@test.com', role: 'OP', tenantId: null },
      token: 'mock-token', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
    });

    // Provide tenant options so the agency dropdown has something to pick.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/tenants') {
        return { options: [{ value: 't-agency-99', label: 'Agency Beta' }], isLoading: false };
      }
      return { options: [], isLoading: false };
    }) as any);

    renderDrawer();

    // Pick the agency
    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByText('Agency Beta'));

    // Find the most recent /v1/branches call and assert the extraParams carry tenantId.
    await waitFor(() => {
      const branchesCall = mockUseFormOptions.mock.calls
        .filter((call) => call[1] === '/v1/branches')
        .at(-1);
      expect(branchesCall).toBeDefined();
      // useFormOptions signature: (queryKey, path, mapFn, extraParams, options)
      expect((branchesCall as unknown[] | undefined)?.[3]).toMatchObject({
        tenantId: 't-agency-99',
        status: 'ACTIVE',
      });
    });
  });

  it('adds custom field rows and disables "Add field" at the max of 4', () => {
    renderDrawer();

    const addBtn = screen.getByText('Add field').closest('button')!;
    expect(addBtn).not.toBeDisabled();
    // No rows initially.
    expect(screen.queryByLabelText('Custom field 1 label')).not.toBeInTheDocument();

    for (let i = 0; i < 4; i++) fireEvent.click(addBtn);

    expect(screen.getByLabelText('Custom field 4 label')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom field 4 value')).toBeInTheDocument();
    expect(addBtn).toBeDisabled();
  });

  it('removes a custom field row and re-enables "Add field"', () => {
    renderDrawer();

    const addBtn = screen.getByText('Add field').closest('button')!;
    for (let i = 0; i < 4; i++) fireEvent.click(addBtn);
    expect(addBtn).toBeDisabled();

    fireEvent.click(screen.getByLabelText('Remove custom field 1'));

    expect(addBtn).not.toBeDisabled();
    expect(screen.queryByLabelText('Custom field 4 label')).not.toBeInTheDocument();
  });
});
