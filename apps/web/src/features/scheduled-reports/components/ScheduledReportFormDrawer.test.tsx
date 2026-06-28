import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ScheduledReportFormDrawer } from './ScheduledReportFormDrawer';
import type { ScheduledReport } from '../types';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: 'CL_ADMIN', tenantId: 'tenant-1' } }),
}));

import { api } from '@/services/api';

const mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockPut = api.PUT as ReturnType<typeof vi.fn>;

function makeSchedule(overrides: Partial<ScheduledReport> = {}): ScheduledReport {
  return {
    id: 'sched-test-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *',
    displayName: 'Daily Inspections',
    deliveryMode: 'OWNER_ONLY',
    recipientUserIds: [],
    skipDeliveryWhenEmpty: false,
    consecutiveFailureCount: 0,
    status: 'ACTIVE',
    lastRunAt: null,
    nextRunAt: null,
    lastRunStatus: null,
    createdByUserId: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <SnackbarProvider>{children}</SnackbarProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

function renderDrawer(props: Partial<React.ComponentProps<typeof ScheduledReportFormDrawer>> = {}) {
  const Wrapper = createWrapper();
  const onClose = vi.fn();
  const onSaved = vi.fn();
  return render(
    <Wrapper>
      <ScheduledReportFormDrawer
        open={true}
        onClose={onClose}
        onSaved={onSaved}
        schedule={null}
        {...props}
      />
    </Wrapper>,
  );
}

describe('ScheduledReportFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { id: 'sched-new-1' } });
    mockPut.mockResolvedValue({ data: { id: 'sched-test-1' } });
  });

  describe('renders correctly', () => {
    it('renders "New Schedule" title in create mode', () => {
      renderDrawer({ schedule: null });
      expect(screen.getByText('New Schedule')).toBeInTheDocument();
    });

    it('renders "Edit Schedule" title in edit mode', () => {
      renderDrawer({ schedule: makeSchedule() });
      expect(screen.getByText('Edit Schedule')).toBeInTheDocument();
    });

    it('renders required form fields', () => {
      renderDrawer();
      expect(screen.getByLabelText('Report type')).toBeInTheDocument();
      expect(screen.getByLabelText('Display name')).toBeInTheDocument();
      expect(screen.getByLabelText('Delivery mode')).toBeInTheDocument();
    });

    it('renders Cancel and Create Schedule buttons in create mode', () => {
      renderDrawer({ schedule: null });
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Create Schedule')).toBeInTheDocument();
    });

    it('renders Save button in edit mode', () => {
      renderDrawer({ schedule: makeSchedule() });
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('pre-fills the display name from the schedule in edit mode', () => {
      renderDrawer({ schedule: makeSchedule({ displayName: 'Pre-filled Name' }) });
      expect(screen.getByDisplayValue('Pre-filled Name')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('shows validation error when report type is not selected on submit', async () => {
      renderDrawer({ schedule: null });
      const submitButton = screen.getByText('Create Schedule');
      fireEvent.click(submitButton);
      await waitFor(() => {
        expect(screen.getByText('Required field')).toBeInTheDocument();
      });
    });

    it('does not call the API when form is invalid', async () => {
      renderDrawer({ schedule: null });
      fireEvent.click(screen.getByText('Create Schedule'));
      await waitFor(() => {
        expect(screen.getByText('Required field')).toBeInTheDocument();
      });
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('calls onSaved after a successful create', async () => {
      const onSaved = vi.fn();
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ScheduledReportFormDrawer open={true} onClose={vi.fn()} onSaved={onSaved} schedule={null} />
        </Wrapper>,
      );

      // SelectInput is a custom dropdown: click trigger then click the option
      const reportTypeSelect = screen.getByLabelText('Report type');
      fireEvent.click(reportTypeSelect);
      const option = await screen.findByText('Inspections Scheduled');
      fireEvent.click(option);

      fireEvent.click(screen.getByText('Create Schedule'));

      await waitFor(() => {
        expect(onSaved).toHaveBeenCalled();
      });
    });

    it('shows loading state on the submit button during submission', async () => {
      let resolvePut!: (value: unknown) => void;
      mockPut.mockImplementation(() => new Promise((r) => { resolvePut = r; }));

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ScheduledReportFormDrawer
            open={true}
            onClose={vi.fn()}
            onSaved={vi.fn()}
            schedule={makeSchedule()}
          />
        </Wrapper>,
      );

      fireEvent.click(screen.getByText('Save'));

      // The button enters loading state immediately
      await waitFor(() => {
        const saveButton = screen.getByText('Save').closest('button');
        expect(saveButton).toBeDisabled();
      });

      // Clean up: resolve the hanging promise
      resolvePut({ data: { id: 'sched-test-1' } });
    });
  });

  describe('close behavior', () => {
    it('calls onClose immediately when the form is untouched', async () => {
      const onClose = vi.fn();
      renderDrawer({ onClose, schedule: null });
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalled();
    });

    it('shows a confirm dialog when the form is dirty and Cancel is clicked', async () => {
      renderDrawer({ schedule: null });
      const displayNameInput = screen.getByLabelText('Display name');
      await userEvent.type(displayNameInput, 'Some text');

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.getByText('Discard changes?')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('does not show success message when the API returns an error', async () => {
      mockPost.mockResolvedValue({ error: { error: { message: 'Server error' } } });

      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ScheduledReportFormDrawer open={true} onClose={vi.fn()} onSaved={vi.fn()} schedule={null} />
        </Wrapper>,
      );

      // SelectInput is a custom dropdown: click trigger then click the option
      const reportTypeSelect = screen.getByLabelText('Report type');
      fireEvent.click(reportTypeSelect);
      const option = await screen.findByText('Inspections Scheduled');
      fireEvent.click(option);

      fireEvent.click(screen.getByText('Create Schedule'));

      await waitFor(() => {
        expect(screen.queryByText('Schedule created')).not.toBeInTheDocument();
      });
    });
  });
});
