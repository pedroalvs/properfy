import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ScheduleRunHistoryDrawer } from './ScheduleRunHistoryDrawer';
import type { ScheduledReportRun } from '../types';

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

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function makeRun(overrides: Partial<ScheduledReportRun> = {}): ScheduledReportRun {
  return {
    id: 'run-1',
    scheduleId: 'sched-1',
    reportId: 'report-1',
    status: 'completed',
    scheduledFor: '2026-04-22T08:00:00Z',
    startedAt: '2026-04-22T08:00:05Z',
    completedAt: '2026-04-22T08:00:30Z',
    errorMessage: null,
    recipientCount: 2,
    createdAt: '2026-04-22T08:00:00Z',
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

function renderDrawer(props: Partial<React.ComponentProps<typeof ScheduleRunHistoryDrawer>> = {}) {
  const Wrapper = createWrapper();
  const onClose = vi.fn();
  return {
    onClose,
    ...render(
      <Wrapper>
        <ScheduleRunHistoryDrawer
          open={true}
          onClose={onClose}
          scheduleId="sched-1"
          scheduleName="Daily Inspections"
          {...props}
        />
      </Wrapper>,
    ),
  };
}

describe('ScheduleRunHistoryDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({
      data: {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
  });

  describe('renders correctly', () => {
    it('renders the drawer title with schedule name', () => {
      renderDrawer({ scheduleName: 'Daily Inspections' });
      expect(screen.getByText('Run history — Daily Inspections')).toBeInTheDocument();
    });

    it('renders a generic title when scheduleName is not provided', () => {
      renderDrawer({ scheduleName: undefined });
      expect(screen.getByText('Run history')).toBeInTheDocument();
    });

    it('shows the empty state when there are no runs', async () => {
      renderDrawer();
      await waitFor(() => {
        expect(screen.getByText('No runs yet')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows a loading skeleton while fetching run history', () => {
      let resolveGet: (value: unknown) => void;
      mockGet.mockImplementation(() => new Promise((r) => { resolveGet = r; }));

      renderDrawer();

      // While loading, no run rows should appear
      expect(screen.queryByText('No runs yet')).not.toBeInTheDocument();

      // Clean up
      resolveGet!({
        data: {
          data: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        },
      });
    });
  });

  describe('displays run data', () => {
    it('renders a run entry with status chip and timestamps', async () => {
      const run = makeRun({ status: 'completed', recipientCount: 3 });
      mockGet.mockResolvedValue({
        data: {
          data: [run],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      });

      renderDrawer();

      await waitFor(() => {
        // ScheduleRunStatusChip renders the status label
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });
    });

    it('renders recipient count when present', async () => {
      const run = makeRun({ recipientCount: 5 });
      mockGet.mockResolvedValue({
        data: {
          data: [run],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      });

      renderDrawer();

      await waitFor(() => {
        expect(screen.getByText(/Recipients: 5/)).toBeInTheDocument();
      });
    });

    it('renders error message when the run has failed with an error', async () => {
      const run = makeRun({ status: 'failed', errorMessage: 'No recipients received the report' });
      mockGet.mockResolvedValue({
        data: {
          data: [run],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        },
      });

      renderDrawer();

      await waitFor(() => {
        expect(screen.getByText('No recipients received the report')).toBeInTheDocument();
      });
    });

    it('renders multiple run entries', async () => {
      const runs = [
        makeRun({ id: 'run-1', status: 'completed' }),
        makeRun({ id: 'run-2', status: 'failed', errorMessage: 'Timeout', recipientCount: null }),
        makeRun({ id: 'run-3', status: 'skipped_empty', recipientCount: null }),
      ];
      mockGet.mockResolvedValue({
        data: {
          data: runs,
          pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 },
        },
      });

      renderDrawer();

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByText('Skipped (empty)')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows an error message when the API call fails', async () => {
      mockGet.mockResolvedValue({ error: { message: 'Network error' } });

      renderDrawer();

      await waitFor(() => {
        expect(screen.getByText(/Failed to load run history/)).toBeInTheDocument();
      });
    });
  });

  describe('disabled when closed', () => {
    it('does not fetch run history when the drawer is closed', () => {
      renderDrawer({ open: false });
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('does not fetch when scheduleId is null', () => {
      renderDrawer({ scheduleId: null });
      expect(mockGet).not.toHaveBeenCalled();
    });
  });
});
