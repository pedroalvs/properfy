import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { api } from '@/services/api';

vi.mock('@properfy/shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  AppointmentStatus: { DRAFT: 'DRAFT', SCHEDULED: 'SCHEDULED', AWAITING_INSPECTOR: 'AWAITING_INSPECTOR', DONE: 'DONE', CANCELLED: 'CANCELLED', REJECTED: 'REJECTED' },
  AppointmentContactRole: { TENANT: 'RENTAL_TENANT', TENANT_REPRESENTATIVE: 'TENANT_REPRESENTATIVE', HOUSEKEEPER: 'HOUSEKEEPER', PROPERTY_MANAGER: 'PROPERTY_MANAGER', BROKER: 'BROKER', OTHER: 'OTHER' },
  RentalTenantConfirmationStatus: { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', UNAVAILABLE: 'UNAVAILABLE', NO_RESPONSE: 'NO_RESPONSE' },
  // 023 §FR-251 — inline contact form needs ContactType + ContactChannelType
  // when picking the registry-row type and adding additional channels.
  ContactType: { TENANT: 'RENTAL_TENANT', PROPERTY_MANAGER: 'PROPERTY_MANAGER', HOUSEKEEPER: 'HOUSEKEEPER', BROKER: 'BROKER', OTHER: 'OTHER' },
  ContactChannelType: { EMAIL: 'EMAIL', PHONE: 'PHONE' },
  PLATFORM_TIMEZONE: 'Australia/Sydney',
  todayInTzDateString: () => '2026-03-29',
  currentTimeInTzHHmm: () => '08:00',
  isTimeStartInPastForDate: () => false,
  validateEditedSchedule: () => ({ ok: true }),
  CUSTOM_FIELD_LABEL_MAX: 50,
  CUSTOM_FIELD_VALUE_MAX: 500,
  CUSTOM_FIELDS_MAX: 4,
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

const mockUseFormOptions = vi.fn((..._args: unknown[]) => ({
  options: [] as Array<{ value: string; label: string }>,
  isLoading: false,
}));

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

// Shallow mock — property-form internals are covered by PropertyFormDrawer's own
// tests. Mirrors the real DrawerPanel dismissal contract: while open, Escape
// calls onClose (backdrop clicks do the same and are exercised via simulate-close).
vi.mock('@/features/properties/components/PropertyFormDrawer', async () => {
  const { useEffect } = await import('react');
  return {
    PropertyFormDrawer: ({
      open,
      onClose,
      onCreated,
      onSaved,
      tenantIdOverride,
      initialBranchId,
      lockBranch,
    }: {
      open: boolean;
      onClose: () => void;
      onCreated?: (id: string) => void;
      onSaved: () => void;
      tenantIdOverride?: string;
      initialBranchId?: string;
      lockBranch?: boolean;
    }) => {
      useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [open, onClose]);
      return open ? (
        <div
          data-testid="property-form-drawer"
          data-tenant={tenantIdOverride ?? ''}
          data-branch={initialBranchId ?? ''}
          data-locked={String(!!lockBranch)}
        >
          <button
            onClick={() => {
              onCreated?.('prop-new');
              onSaved();
            }}
          >
            simulate-create
          </button>
          <button onClick={onClose}>simulate-close</button>
        </div>
      ) : null;
    },
  };
});

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
  branchName: 'North Shore Office', propertyAddress: '5/24 Belgrave St, Kogarah NSW 2217',
  serviceTypeName: 'Routine Inspection',
  scheduledDate: '2026-04-01', timeSlotStart: '09:00', timeSlotEnd: '12:00', contactName: 'John Doe',
  contactPhone: '11999999999', contactEmail: 'john@test.com', keyRequired: true,
  meetingLocation: 'Lobby', keyLocation: 'Portaria', notes: 'Test notes',
  status: 'AWAITING_INSPECTOR',
  inspectorId: null,
  restrictions: [{ id: 'res-1', isHome: true, unavailableDaysJson: null, unavailableHoursJson: null, notes: 'Ring bell', source: 'OPERATOR' }],
};

// A restriction row written by the rental tenant portal on decline: it exists only to
// carry availableSlotsJson, and holds nothing the operator authored.
const MOCK_APPOINTMENT_PORTAL_RESTRICTION = {
  ...MOCK_APPOINTMENT,
  id: 'apt-portal-restriction',
  restrictions: [{
    id: 'res-portal',
    isHome: false,
    unavailableDaysJson: null,
    unavailableHoursJson: null,
    availableSlotsJson: [{ dayOfWeek: 'WED', start: '09:00', end: '17:00' }],
    notes: null,
    source: 'RENTAL_TENANT_PORTAL',
  }],
};

// Same appointment, but belonging to a service group — used to verify the
// date field stays disabled while the time-slot fields remain editable.
const MOCK_APPOINTMENT_GROUPED = {
  ...MOCK_APPOINTMENT,
  id: 'apt-grouped',
  serviceGroupId: 'sg-01',
};

// DONE appointment pending cross-check (Review section shows "Confirm Done").
const MOCK_APPOINTMENT_DONE = {
  ...MOCK_APPOINTMENT,
  id: 'apt-done',
  status: 'DONE',
  inspectorId: 'insp-1',
  doneCheckedByUserId: null,
};

// DONE appointment already cross-checked (Review section shows the indicator).
const MOCK_APPOINTMENT_REVIEWED = {
  ...MOCK_APPOINTMENT_DONE,
  id: 'apt-reviewed',
  doneCheckedByUserId: 'reviewer-1',
};

const mockRefetchDetail = vi.fn();
vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    if (!id) return { appointment: null, isLoading: false, isError: false, refetch: mockRefetchDetail };
    if (id === 'apt-grouped') {
      return { appointment: MOCK_APPOINTMENT_GROUPED, isLoading: false, isError: false, refetch: mockRefetchDetail };
    }
    if (id === 'apt-done') {
      return { appointment: MOCK_APPOINTMENT_DONE, isLoading: false, isError: false, refetch: mockRefetchDetail };
    }
    if (id === 'apt-reviewed') {
      return { appointment: MOCK_APPOINTMENT_REVIEWED, isLoading: false, isError: false, refetch: mockRefetchDetail };
    }
    if (id === 'apt-portal-restriction') {
      return { appointment: MOCK_APPOINTMENT_PORTAL_RESTRICTION, isLoading: false, isError: false, refetch: mockRefetchDetail };
    }
    return { appointment: MOCK_APPOINTMENT, isLoading: false, isError: false, refetch: mockRefetchDetail };
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

describe('AppointmentFormDrawer — restriction toggle reflects only operator restrictions', () => {
  // A portal-written row exists purely to carry the tenant's availability. Deriving the
  // toggle from `restrictions.length` turns it on for those rows, so switching it off
  // never sticks: the row survives the save and the toggle comes back on.
  it('leaves the toggle off when the only restriction came from the portal', async () => {
    renderDrawer({ appointmentId: 'apt-portal-restriction' });

    const toggle = await screen.findByRole('checkbox', { name: 'Add access restriction' });
    expect(toggle).not.toBeChecked();
    // The operator-only fields stay hidden behind the toggle.
    expect(screen.queryByRole('checkbox', { name: 'Tenant will be home' })).not.toBeInTheDocument();
  });

  it('turns the toggle on for an operator-authored restriction', async () => {
    renderDrawer({ appointmentId: 'apt-01' });

    const toggle = await screen.findByRole('checkbox', { name: 'Add access restriction' });
    expect(toggle).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tenant will be home' })).toBeChecked();
  });
});

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

  // Contacts are optional for every service type, so the operator must be able
  // to get to zero. The remove button used to be hidden on the last row.
  it('lets the operator remove the only contact and shows an empty state', async () => {
    renderDrawer({ appointmentId: 'apt-01' });

    const removeButton = await screen.findByLabelText('Remove contact 1');
    fireEvent.click(removeButton);

    expect(screen.queryByLabelText('Contact 1 Display name')).not.toBeInTheDocument();
    expect(screen.getByText(/no contacts\./i)).toBeInTheDocument();
    // Still recoverable — the section keeps its Add button.
    expect(screen.getByText('Add Contact')).toBeInTheDocument();
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

  it('shows an inline AU phone error when an invalid contact phone is blurred', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    const phone = screen.getByLabelText('Contact 1 Phone');
    fireEvent.change(phone, { target: { value: '123' } });
    fireEvent.blur(phone);
    expect(screen.getByText('Enter a valid Australian phone number')).toBeInTheDocument();
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

  // Regression: an import-created property has `branch_id = NULL`, so the
  // branch-scoped `/v1/properties` list can never contain it. The field is
  // locked in edit mode, so with no matching option it rendered the
  // "Select property" placeholder and the linked property became invisible.
  it('renders the linked property, branch and service type in edit mode even when the scoped lists exclude them', () => {
    mockUseFormOptions.mockImplementation((...args: unknown[]) => {
      if (args[1] === '/v1/properties') {
        return { options: [{ value: 'prop-other', label: 'SPS-003 - 5 Blue St' }], isLoading: false };
      }
      return { options: [], isLoading: false };
    });

    renderDrawer({ appointmentId: 'apt-01' });

    expect(screen.getByLabelText('Property')).toHaveTextContent('5/24 Belgrave St, Kogarah NSW 2217');
    expect(screen.getByLabelText('Branch')).toHaveTextContent('North Shore Office');
    expect(screen.getByLabelText('Service Type')).toHaveTextContent('Routine Inspection');
  });

  it('does not duplicate the current option when the scoped list already contains it', () => {
    mockUseFormOptions.mockImplementation((...args: unknown[]) => {
      if (args[1] === '/v1/properties') {
        return {
          options: [
            { value: 'prop-1', label: 'SPS-001 - Belgrave St' },
            { value: 'prop-other', label: 'SPS-003 - 5 Blue St' },
          ],
          isLoading: false,
        };
      }
      return { options: [], isLoading: false };
    });

    renderDrawer({ appointmentId: 'apt-01' });

    // The list label wins over the appointment snapshot, and appears once.
    const property = screen.getByLabelText('Property');
    expect(property).toHaveTextContent('SPS-001 - Belgrave St');
    expect(property).not.toHaveTextContent('Kogarah');
  });

  it('allows editing the time slot (free start/end range) in edit mode', () => {
    renderDrawer({ appointmentId: 'apt-01' });
    const start = screen.getByLabelText('Start time') as HTMLInputElement;
    const end = screen.getByLabelText('End time') as HTMLInputElement;
    expect(start).not.toBeDisabled();
    expect(end).not.toBeDisabled();
    // Pre-populated from the loaded appointment's start/end. The field shows the
    // masked 12-hour text; the value it emits stays canonical 24-hour HH:mm.
    expect(start.value).toBe('9:00 am');
    expect(end.value).toBe('12:00 pm');
  });

  it('grouped appointment: date field disabled, time-slot fields remain editable', () => {
    renderDrawer({ appointmentId: 'apt-grouped' });
    const date = screen.getByLabelText('Scheduled Date') as HTMLInputElement;
    const start = screen.getByLabelText('Start time') as HTMLInputElement;
    const end = screen.getByLabelText('End time') as HTMLInputElement;
    expect(date).toBeDisabled();
    expect(start).not.toBeDisabled();
    expect(end).not.toBeDisabled();
  });

  // Without this flag the backend rejects any grouped time edit that leaves the
  // group's shared window (422), which is what made per-appointment time
  // adjustment impossible from the UI.
  it('grouped appointment: opts into widening the group time window on save', async () => {
    mockValidate.mockReturnValue({});
    mockSave.mockResolvedValue({ success: true, id: 'apt-grouped' });
    renderDrawer({ appointmentId: 'apt-grouped' });

    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.anything(),
        'apt-grouped',
        { expandGroupTimeWindow: true },
      );
    });
  });

  it('ungrouped appointment: does not ask to widen any group window', async () => {
    mockValidate.mockReturnValue({});
    mockSave.mockResolvedValue({ success: true, id: 'apt-01' });
    renderDrawer({ appointmentId: 'apt-01' });

    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } });
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(expect.anything(), 'apt-01', undefined);
    });
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

  it('renders backend VALIDATION_ERROR details inline on the matching fields', async () => {
    mockSave.mockResolvedValue({
      success: false,
      errorCode: 'VALIDATION_ERROR',
      fieldErrors: { scheduledDate: 'Scheduled date cannot be in the past' },
    });

    const onSaved = vi.fn();
    renderDrawer({ onSaved });

    fireEvent.click(screen.getByText('Create Appointment'));

    await waitFor(() => {
      expect(screen.getByText('Scheduled date cannot be in the past')).toBeInTheDocument();
    });
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

  it('opens the inline property drawer pre-filled with agency and locked branch (create mode)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/tenants') return { options: [{ value: 'tenant-1', label: 'Agency One' }], isLoading: false };
      if (path === '/v1/branches') return { options: [{ value: 'branch-9', label: 'Branch Nine' }], isLoading: false };
      return { options: [], isLoading: false };
    }) as any);

    renderDrawer();

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(screen.getByText('Branch Nine'));

    fireEvent.click(screen.getByText('Property not listed? Create one'));

    const drawer = screen.getByTestId('property-form-drawer');
    expect(drawer).toHaveAttribute('data-tenant', 'tenant-1');
    expect(drawer).toHaveAttribute('data-branch', 'branch-9');
    expect(drawer).toHaveAttribute('data-locked', 'true');
  });

  it('auto-selects the created property and closes only the nested drawer on create success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/tenants') return { options: [{ value: 'tenant-1', label: 'Agency One' }], isLoading: false };
      if (path === '/v1/branches') return { options: [{ value: 'branch-9', label: 'Branch Nine' }], isLoading: false };
      if (path === '/v1/properties') return { options: [{ value: 'prop-new', label: 'AG-PROP-0009 - New St' }], isLoading: false };
      return { options: [], isLoading: false };
    }) as any);

    renderDrawer();

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(screen.getByText('Branch Nine'));

    fireEvent.click(screen.getByText('Property not listed? Create one'));
    fireEvent.click(screen.getByText('simulate-create'));

    await waitFor(() => {
      expect(screen.queryByTestId('property-form-drawer')).not.toBeInTheDocument();
    });
    // Appointment drawer is still open and now shows the created property.
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
    expect(screen.getByText('AG-PROP-0009 - New St')).toBeInTheDocument();
  });

  it('Escape closes only the nested property drawer, not the appointment drawer', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/tenants') return { options: [{ value: 'tenant-1', label: 'Agency One' }], isLoading: false };
      if (path === '/v1/branches') return { options: [{ value: 'branch-9', label: 'Branch Nine' }], isLoading: false };
      return { options: [], isLoading: false };
    }) as any);
    const onClose = vi.fn();

    renderDrawer({ onClose });

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(screen.getByText('Branch Nine'));
    fireEvent.click(screen.getByText('Property not listed? Create one'));

    fireEvent.keyDown(document, { key: 'Escape' });

    // The nested drawer closes; the appointment drawer must neither close
    // nor show its discard dialog.
    await waitFor(() => {
      expect(screen.queryByTestId('property-form-drawer')).not.toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
  });

  it('backdrop-style close dismisses only the nested property drawer', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseFormOptions.mockImplementation(((_key: any, path: any) => {
      if (path === '/v1/tenants') return { options: [{ value: 'tenant-1', label: 'Agency One' }], isLoading: false };
      if (path === '/v1/branches') return { options: [{ value: 'branch-9', label: 'Branch Nine' }], isLoading: false };
      return { options: [], isLoading: false };
    }) as any);
    const onClose = vi.fn();

    renderDrawer({ onClose });

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(screen.getByText('Branch Nine'));
    fireEvent.click(screen.getByText('Property not listed? Create one'));

    fireEvent.click(screen.getByText('simulate-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('property-form-drawer')).not.toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
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

  describe('Review (DONE cross-check)', () => {
    it('shows the Review section with a Confirm Done button for AM/OP on a DONE, unchecked appointment', () => {
      renderDrawer({ appointmentId: 'apt-done' });
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm Done/ })).toBeInTheDocument();
      expect(screen.queryByTestId('reviewed-indicator')).not.toBeInTheDocument();
    });

    it('shows a read-only Reviewed indicator when already cross-checked', () => {
      renderDrawer({ appointmentId: 'apt-reviewed' });
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByTestId('reviewed-indicator')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Confirm Done/ })).not.toBeInTheDocument();
    });

    it('hides the Review section when the appointment is not DONE', () => {
      renderDrawer({ appointmentId: 'apt-01' });
      expect(screen.queryByText('Review')).not.toBeInTheDocument();
    });

    it('hides the Review section for non-privileged roles', () => {
      mockUseAuth.mockReturnValue({
        user: { id: 'cl-1', name: 'Client', email: 'cl@test.com', role: 'CL_ADMIN', tenantId: 't-1' },
        token: 'mock-token', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
      });
      renderDrawer({ appointmentId: 'apt-done' });
      expect(screen.queryByText('Review')).not.toBeInTheDocument();
    });

    it('confirming triggers the cross-check endpoint and refreshes on success', async () => {
      const onSaved = vi.fn();
      renderDrawer({ appointmentId: 'apt-done', onSaved });

      // Section button opens the confirm dialog.
      fireEvent.click(screen.getByRole('button', { name: /Confirm Done/ }));

      // Dialog + section each render a "Confirm Done" control — click the dialog's.
      const confirmButtons = screen.getAllByRole('button', { name: /Confirm Done/ });
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          '/v1/appointments/apt-done/cross-check-done',
          { body: {} },
        );
      });

      // On success the drawer detail is refetched and the parent is notified,
      // so the reviewed state propagates to both the drawer and the list.
      await waitFor(() => {
        expect(mockRefetchDetail).toHaveBeenCalled();
        expect(onSaved).toHaveBeenCalled();
      });
    });
  });
});
