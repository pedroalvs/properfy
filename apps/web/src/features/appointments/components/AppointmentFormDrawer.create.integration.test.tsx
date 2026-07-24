/**
 * Integration coverage for the appointment CREATE submit path.
 *
 * Unlike `AppointmentFormDrawer.test.tsx`, this file does NOT mock
 * `useAppointmentSave` or `@properfy/shared` — the real `validate()` and the
 * real Zod schemas run, so the whole chain form state → payload → `POST
 * /v1/appointments` is exercised end to end.
 *
 * Why it exists: the retired `/appointments/new` page shipped a form whose
 * state seeded one blank contacts row it never rendered. `validate()` failed on
 * that invisible row for every submit, so the button did nothing at all — no
 * request, no message. Nothing covered "a filled form actually submits", so it
 * went unnoticed. These tests lock that contract for the surviving form and
 * assert that a blocked submit always leaves a message the user can see.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
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

// The shared create schema validates ids as UUIDs — fixtures must look real.
const TENANT_ID = '8d39f531-0dd5-4a4f-af33-c470a1432cad';
const BRANCH_ID = '8df8627b-a4e2-4008-b330-1ac4c50cc323';
const PROPERTY_ID = '0ed353e0-0751-46f3-940d-fb5cc8ce1122';
const SERVICE_TYPE_ID = 'c6a5f0d2-3b1e-4f7a-9c8d-2e5b7a1f4c33';

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (queryKey: unknown[]) => {
    const [resource] = queryKey;
    if (resource === 'tenants') return { options: [{ value: TENANT_ID, label: 'Agency One' }], isLoading: false };
    if (resource === 'branches') return { options: [{ value: BRANCH_ID, label: 'North Shore Office' }], isLoading: false };
    if (resource === 'service-types') return { options: [{ value: SERVICE_TYPE_ID, label: 'Routine Inspection' }], isLoading: false };
    if (resource === 'properties') return { options: [{ value: PROPERTY_ID, label: 'SPS-003 - 5 Blue St' }], isLoading: false };
    return { options: [], isLoading: false };
  },
}));

vi.mock('../hooks/useContactSearch', () => ({
  useContactSearch: () => ({
    search: '', debouncedSearch: '', results: [], isSearching: false, setSearch: vi.fn(), reset: vi.fn(),
  }),
}));

vi.mock('@/features/properties/components/PropertyFormDrawer', () => ({
  PropertyFormDrawer: () => null,
}));

import { api } from '@/services/api';
import { AppointmentFormDrawer } from './AppointmentFormDrawer';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>
  );
}

function renderCreateDrawer() {
  return render(
    <AppointmentFormDrawer open onClose={vi.fn()} appointmentId={null} onSaved={vi.fn()} />,
    { wrapper: createWrapper() },
  );
}

function selectOption(label: string, optionText: string) {
  fireEvent.click(screen.getByLabelText(label));
  // `role="option"` — the same text also sits in the closed trigger of any
  // select already holding that value.
  fireEvent.click(screen.getByRole('option', { name: optionText }));
}

/** Fill every required field. `overrides` skips or changes individual steps. */
function fillRequiredFields(overrides: { start?: string; end?: string; date?: string; contactType?: boolean } = {}) {
  selectOption('Agency', 'Agency One');
  selectOption('Branch', 'North Shore Office');
  selectOption('Property', 'SPS-003 - 5 Blue St');
  selectOption('Service Type', 'Routine Inspection');
  fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: overrides.date ?? '2030-06-16' } });
  fireEvent.change(screen.getByLabelText('Start time'), { target: { value: overrides.start ?? '10:00' } });
  fireEvent.change(screen.getByLabelText('End time'), { target: { value: overrides.end ?? '11:00' } });
  fireEvent.change(screen.getByLabelText('Contact 1 Display name'), { target: { value: 'Jane Tenant' } });
  fireEvent.change(screen.getByLabelText('Contact 1 Email'), { target: { value: 'jane@test.com' } });
  if (overrides.contactType !== false) selectOption('Contact 1 Contact type', 'Tenant');
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create Appointment' }));
}

interface CreatedContact {
  isPrimary: boolean;
  role: string;
  inline?: { type?: string; displayName?: string; primaryEmail?: string | null; primaryPhone?: string | null };
  contactId?: string;
}

interface CreatedPayload {
  branchId?: string;
  propertyId?: string;
  serviceTypeId?: string;
  scheduledDate?: string;
  timeSlotStart?: string;
  timeSlotEnd?: string;
  contacts?: CreatedContact[];
}

/** Body of the `POST /v1/appointments` call, or undefined when none happened. */
function createdPayload(): CreatedPayload | undefined {
  const call = mockPost.mock.calls.find(([path]) => path === '/v1/appointments');
  return call?.[1]?.body as CreatedPayload | undefined;
}

describe('AppointmentFormDrawer — create submit (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } });
    mockPost.mockResolvedValue({ data: { data: { id: 'apt-new' } }, error: null });
    // Midday Sydney (02:00Z = 12:00 AEST) so "today" and "now" are deterministic.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2030-06-15T02:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the appointment with a fully-formed primary contact', async () => {
    renderCreateDrawer();
    fillRequiredFields();
    submit();

    await waitFor(() => expect(createdPayload()).toBeDefined());

    const payload = createdPayload()!;
    expect(payload).toMatchObject({
      branchId: BRANCH_ID,
      propertyId: PROPERTY_ID,
      serviceTypeId: SERVICE_TYPE_ID,
      scheduledDate: '2030-06-16',
      timeSlotStart: '10:00',
      timeSlotEnd: '11:00',
    });
    // The exact shape that used to be malformed and silently rejected.
    expect(payload.contacts ?? []).toHaveLength(1);
    expect(payload.contacts?.[0]).toMatchObject({
      isPrimary: true,
      inline: { type: 'RENTAL_TENANT', displayName: 'Jane Tenant', primaryEmail: 'jane@test.com' },
    });
  });

  it('never blocks the submit silently — a rejected form shows an inline error', async () => {
    renderCreateDrawer();
    fillRequiredFields({ contactType: false });
    submit();

    expect(await screen.findByText('Contact type is required')).toBeInTheDocument();
    expect(createdPayload()).toBeUndefined();
  });

  it('rejects a start time already past on today with an inline error', () => {
    renderCreateDrawer();
    fillRequiredFields({ date: '2030-06-15', start: '09:00', end: '11:00' });
    submit();

    expect(screen.getByText('Start time is in the past')).toBeInTheDocument();
    expect(createdPayload()).toBeUndefined();
  });

  it('accepts a later start time on today', async () => {
    renderCreateDrawer();
    fillRequiredFields({ date: '2030-06-15', start: '15:00', end: '17:00' });
    submit();

    await waitFor(() => expect(createdPayload()).toBeDefined());
    expect(screen.queryByText('Start time is in the past')).not.toBeInTheDocument();
  });
});
