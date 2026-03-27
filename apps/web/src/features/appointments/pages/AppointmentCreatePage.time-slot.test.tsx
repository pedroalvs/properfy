import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { AppointmentCreatePage } from './AppointmentCreatePage';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: null },
  }),
}));

vi.mock('@/features/properties/components/PropertyFormDrawer', () => ({
  PropertyFormDrawer: () => null,
}));

vi.mock('@/hooks/useSnackbar', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSnackbar')>('@/hooks/useSnackbar');
  return {
    ...actual,
    useSnackbar: () => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    }),
  };
});

vi.mock('../hooks/useAppointmentSave', () => ({
  useAppointmentSave: () => ({
    save: vi.fn(),
    isSaving: false,
    validate: () => ({}),
  }),
}));

vi.mock('../hooks/useTimeSlotOptions', () => ({
  useTimeSlotOptions: (branchId?: string) => ({
    options: branchId ? [{ label: 'Morning (09:00 - 12:00)', value: '09:00-12:00' }] : [],
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (queryKey: unknown[]) => {
    const [resource, scope, tenantId, marker] = queryKey;
    if (resource === 'tenants') {
      return {
        options: [
          { value: 'tenant-1', label: 'Agency One' },
          { value: 'tenant-2', label: 'Agency Two' },
        ],
        isLoading: false,
      };
    }
    if (resource === 'branches' && scope === 'appointment-create') {
      return {
        options: tenantId === 'tenant-1'
          ? [{ value: 'branch-1', label: 'Branch One' }]
          : [{ value: 'branch-2', label: 'Branch Two' }],
        isLoading: false,
      };
    }
    if (resource === 'properties' && marker === 'branch') {
      return {
        options: tenantId === 'tenant-1'
          ? [{ value: 'property-1', label: 'P1 - 12 Harbour St' }]
          : [{ value: 'property-2', label: 'P2 - 99 George St' }],
        isLoading: false,
      };
    }
    if (resource === 'service-types') {
      return {
        options: [{ value: 'service-1', label: 'Routine Inspection' }],
        isLoading: false,
      };
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

describe('AppointmentCreatePage time slot dependencies', () => {
  it('clears the selected time slot when the agency changes', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AppointmentCreatePage />
      </Wrapper>,
    );

    selectOption('Agency', 'Agency One');
    selectOption('Branch', 'Branch One');
    selectOption('Time Slot', 'Morning (09:00 - 12:00)');

    expect(screen.getByLabelText('Time Slot')).toHaveTextContent('Morning (09:00 - 12:00)');

    selectOption('Agency', 'Agency Two');

    await waitFor(() => {
      expect(screen.getByLabelText('Time Slot')).toHaveTextContent('Select a branch first');
    });
  });
});
