import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ScheduledReportRowActions } from './ScheduledReportRowActions';
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
    PATCH: vi.fn(),
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

const _mockPost = api.POST as ReturnType<typeof vi.fn>;
const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

function makeSchedule(overrides: Partial<ScheduledReport> = {}): ScheduledReport {
  return {
    id: 'sched-1',
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
    isActive: true,
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

describe('ScheduledReportRowActions', () => {
  let onEdit: ReturnType<typeof vi.fn>;
  let onViewRuns: ReturnType<typeof vi.fn>;
  let onMutated: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onEdit = vi.fn();
    onViewRuns = vi.fn();
    onMutated = vi.fn();
    vi.clearAllMocks();
  });

  it('shows Pause action for ACTIVE schedule', () => {
    const report = makeSchedule({ status: 'ACTIVE' });
    render(
      <ScheduledReportRowActions
        report={report}
        onEdit={onEdit}
        onViewRuns={onViewRuns}
        onMutated={onMutated}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
    expect(screen.queryByLabelText('Resume')).not.toBeInTheDocument();
  });

  it('shows Resume action for PAUSED schedule', () => {
    const report = makeSchedule({ status: 'PAUSED' });
    render(
      <ScheduledReportRowActions
        report={report}
        onEdit={onEdit}
        onViewRuns={onViewRuns}
        onMutated={onMutated}
      />,
      { wrapper: createWrapper() },
    );
    expect(screen.getByLabelText('Resume')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pause')).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit is clicked', () => {
    const report = makeSchedule();
    render(
      <ScheduledReportRowActions
        report={report}
        onEdit={onEdit}
        onViewRuns={onViewRuns}
        onMutated={onMutated}
      />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('calls onViewRuns when View run history is clicked', () => {
    const report = makeSchedule();
    render(
      <ScheduledReportRowActions
        report={report}
        onEdit={onEdit}
        onViewRuns={onViewRuns}
        onMutated={onMutated}
      />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByLabelText('View run history'));
    expect(onViewRuns).toHaveBeenCalledOnce();
  });

  it('shows delete confirm dialog when Delete is clicked', () => {
    const report = makeSchedule();
    render(
      <ScheduledReportRowActions
        report={report}
        onEdit={onEdit}
        onViewRuns={onViewRuns}
        onMutated={onMutated}
      />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByLabelText('Delete'));
    expect(screen.getByText('Delete schedule?')).toBeInTheDocument();
  });

  it('calls delete API and invokes onMutated on confirm', async () => {
    mockDelete.mockResolvedValue({ data: null, error: null });
    const report = makeSchedule();
    render(
      <ScheduledReportRowActions
        report={report}
        onEdit={onEdit}
        onViewRuns={onViewRuns}
        onMutated={onMutated}
      />,
      { wrapper: createWrapper() },
    );
    fireEvent.click(screen.getByLabelText('Delete'));
    // Dialog has two "Delete" roles — pick the confirm button inside the dialog
    const allDeleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    const confirmBtn = allDeleteButtons.at(-1);
    if (!confirmBtn) throw new Error('Delete confirm button not found');
    fireEvent.click(confirmBtn);
    await vi.waitFor(() => {
      expect(onMutated).toHaveBeenCalledOnce();
    });
  });
});
