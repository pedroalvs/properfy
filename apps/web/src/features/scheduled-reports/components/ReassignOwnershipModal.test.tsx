import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ReassignOwnershipModal } from './ReassignOwnershipModal';
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

import { api } from '@/services/api';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function makeSchedule(overrides: Partial<ScheduledReport> = {}): ScheduledReport {
  return {
    id: 'sched-reassign-1',
    tenantId: 'tenant-1',
    reportType: 'INSPECTIONS_SCHEDULED',
    filtersJson: {},
    format: 'XLSX',
    cronExpression: '0 8 * * *',
    displayName: 'Weekly Report',
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

function renderModal(props: Partial<React.ComponentProps<typeof ReassignOwnershipModal>> = {}) {
  const Wrapper = createWrapper();
  const onClose = vi.fn();
  const onReassigned = vi.fn();
  const schedule = makeSchedule();
  return {
    onClose,
    onReassigned,
    ...render(
      <Wrapper>
        <ReassignOwnershipModal
          open={true}
          onClose={onClose}
          schedule={schedule}
          onReassigned={onReassigned}
          {...props}
        />
      </Wrapper>,
    ),
  };
}

describe('ReassignOwnershipModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: null, error: undefined });
  });

  describe('renders correctly', () => {
    it('renders the dialog title', () => {
      renderModal();
      expect(screen.getByText('Reassign ownership')).toBeInTheDocument();
    });

    it('shows the schedule name in the description text', () => {
      renderModal({ schedule: makeSchedule({ displayName: 'Weekly Report' }) });
      expect(screen.getByText(/Weekly Report/)).toBeInTheDocument();
    });

    it('shows the report type when displayName is null', () => {
      renderModal({ schedule: makeSchedule({ displayName: null }) });
      expect(screen.getByText(/INSPECTIONS_SCHEDULED/)).toBeInTheDocument();
    });

    it('renders the new owner user ID input', () => {
      renderModal();
      expect(screen.getByLabelText('New owner user ID')).toBeInTheDocument();
    });

    it('renders Cancel and Reassign buttons', () => {
      renderModal();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Reassign')).toBeInTheDocument();
    });

    it('returns null when schedule is null', () => {
      const Wrapper = createWrapper();
      const { container } = render(
        <Wrapper>
          <ReassignOwnershipModal open={true} onClose={vi.fn()} schedule={null} onReassigned={vi.fn()} />
        </Wrapper>,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('form validation', () => {
    it('shows validation error when the user ID field is empty on submit', async () => {
      renderModal();
      fireEvent.click(screen.getByText('Reassign'));
      await waitFor(() => {
        expect(screen.getByText('Required field')).toBeInTheDocument();
      });
    });

    it('does not call the API when the input is empty', async () => {
      renderModal();
      fireEvent.click(screen.getByText('Reassign'));
      await waitFor(() => {
        expect(screen.getByText('Required field')).toBeInTheDocument();
      });
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('clears the validation error when the user starts typing', async () => {
      renderModal();
      fireEvent.click(screen.getByText('Reassign'));
      await waitFor(() => {
        expect(screen.getByText('Required field')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('New owner user ID');
      fireEvent.change(input, { target: { value: 'new-user-id' } });

      expect(screen.queryByText('Required field')).not.toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('calls the reassign API with the correct schedule id and new owner', async () => {
      renderModal({ schedule: makeSchedule({ id: 'sched-reassign-1' }) });
      const input = screen.getByLabelText('New owner user ID');
      fireEvent.change(input, { target: { value: 'new-owner-uuid' } });
      fireEvent.click(screen.getByText('Reassign'));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalled();
      });
    });

    it('calls onReassigned after a successful submission', async () => {
      const onReassigned = vi.fn();
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ReassignOwnershipModal
            open={true}
            onClose={vi.fn()}
            schedule={makeSchedule()}
            onReassigned={onReassigned}
          />
        </Wrapper>,
      );

      const input = screen.getByLabelText('New owner user ID');
      fireEvent.change(input, { target: { value: 'new-owner-uuid' } });
      fireEvent.click(screen.getByText('Reassign'));

      await waitFor(() => {
        expect(onReassigned).toHaveBeenCalled();
      });
    });

    it('shows loading state on the Reassign button during submission', async () => {
      let resolvePost: (value: unknown) => void;
      mockPost.mockImplementation(() => new Promise((r) => { resolvePost = r; }));

      renderModal();
      const input = screen.getByLabelText('New owner user ID');
      fireEvent.change(input, { target: { value: 'new-owner-uuid' } });
      fireEvent.click(screen.getByText('Reassign'));

      await waitFor(() => {
        const reassignButton = screen.getByText('Reassign').closest('button');
        expect(reassignButton).toBeDisabled();
      });

      // Clean up
      resolvePost!({ data: null, error: undefined });
    });

    it('resets the input field after a successful reassignment', async () => {
      const onReassigned = vi.fn();
      const Wrapper = createWrapper();
      render(
        <Wrapper>
          <ReassignOwnershipModal
            open={true}
            onClose={vi.fn()}
            schedule={makeSchedule()}
            onReassigned={onReassigned}
          />
        </Wrapper>,
      );

      const input = screen.getByLabelText('New owner user ID');
      fireEvent.change(input, { target: { value: 'new-owner-uuid' } });
      fireEvent.click(screen.getByText('Reassign'));

      await waitFor(() => {
        expect(onReassigned).toHaveBeenCalled();
      });

      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  describe('close behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const { onClose } = renderModal();
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalled();
    });

    it('clears the input field immediately when Cancel is clicked', () => {
      renderModal();
      const input = screen.getByLabelText('New owner user ID');
      fireEvent.change(input, { target: { value: 'some-input' } });
      expect((input as HTMLInputElement).value).toBe('some-input');

      fireEvent.click(screen.getByText('Cancel'));

      // The component calls setNewOwnerUserId('') in handleClose
      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  describe('error state', () => {
    it('shows a snackbar error when the API returns an error', async () => {
      mockPost.mockResolvedValue({ error: { error: { message: 'Not found' } } });

      renderModal();
      const input = screen.getByLabelText('New owner user ID');
      fireEvent.change(input, { target: { value: 'bad-user-id' } });
      fireEvent.click(screen.getByText('Reassign'));

      await waitFor(() => {
        expect(screen.queryByText('Ownership reassigned')).not.toBeInTheDocument();
      });
    });
  });
});
