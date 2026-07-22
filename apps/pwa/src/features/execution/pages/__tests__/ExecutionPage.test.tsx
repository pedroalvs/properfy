import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExecutionPage } from '../ExecutionPage';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom') as Record<string, unknown>;
  return {
    ...actual,
    useBlocker: () => ({ state: 'unblocked', reset: vi.fn(), proceed: vi.fn() }),
  };
});

vi.mock('@/features/schedule/hooks/useInspectorAppointment', () => ({
  useInspectorAppointment: vi.fn(),
}));

vi.mock('../../hooks/useLocalExecutionState', () => ({
  useLocalExecutionState: vi.fn(),
}));

vi.mock('../../hooks/useAutoSave', () => ({
  useAutoSave: vi.fn(),
}));

vi.mock('../../hooks/useStartInspection', () => ({
  useStartInspection: vi.fn(),
}));

vi.mock('../../hooks/useFinishInspection', () => ({
  useFinishInspection: vi.fn(),
}));

vi.mock('../../components/PreStartPanel', () => ({
  PreStartPanel: ({ onStart }: { onStart: (location: { latitude: number; longitude: number; capturedAt: string }) => void }) => (
    <button
      type="button"
      data-testid="mock-start-button"
      onClick={() =>
        onStart({
          latitude: -33.8688,
          longitude: 151.2093,
          capturedAt: '2026-03-24T10:00:00.000Z',
        })
      }
    >
      Start
    </button>
  ),
}));

vi.mock('../../components/FinishingPanel', () => ({
  FinishingPanel: ({ onSubmit }: { onSubmit: (location: { latitude: number; longitude: number; capturedAt: string; accuracy: number }) => void }) => (
    <button
      type="button"
      data-testid="mock-submit-button"
      onClick={() =>
        onSubmit({
          latitude: -33.8688,
          longitude: 151.2093,
          accuracy: 10,
          capturedAt: '2026-03-24T10:30:00.000Z',
        })
      }
    >
      Submit Inspection
    </button>
  ),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: vi.fn(),
}));

import { useInspectorAppointment } from '@/features/schedule/hooks/useInspectorAppointment';
import { useLocalExecutionState } from '../../hooks/useLocalExecutionState';
import { useStartInspection } from '../../hooks/useStartInspection';
import { useFinishInspection } from '../../hooks/useFinishInspection';
import { useSnackbar } from '@/hooks/useSnackbar';

const mockUseInspectorAppointment = vi.mocked(useInspectorAppointment);
const mockUseLocalExecutionState = vi.mocked(useLocalExecutionState);
const mockUseStartInspection = vi.mocked(useStartInspection);
const mockUseFinishInspection = vi.mocked(useFinishInspection);
const mockUseSnackbar = vi.mocked(useSnackbar);
const mockStartMutateAsync = vi.fn();
const mockFinishMutateAsync = vi.fn();
const mockShowError = vi.fn();
const mockShowInfo = vi.fn();

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/execution/apt-1']}>
        <Routes>
          <Route path="/execution/:appointmentId" element={<ExecutionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ExecutionPage', () => {
  beforeEach(() => {
    mockStartMutateAsync.mockReset();
    mockFinishMutateAsync.mockReset();
    mockShowError.mockReset();
    mockShowInfo.mockReset();

    mockUseStartInspection.mockReturnValue({
      mutateAsync: mockStartMutateAsync,
      isPending: false,
    } as ReturnType<typeof useStartInspection>);

    mockUseSnackbar.mockReturnValue({
      messages: [],
      showSuccess: vi.fn(),
      showError: mockShowError,
      showInfo: mockShowInfo,
      dismiss: vi.fn(),
    });

    mockUseFinishInspection.mockReturnValue({
      mutateAsync: mockFinishMutateAsync,
      isPending: false,
    } as ReturnType<typeof useFinishInspection>);

    mockUseLocalExecutionState.mockReturnValue({
      state: {
        appointmentId: 'apt-1',
        phase: 'PRE_START',
        pendingSync: false,
        startLocation: null,
        finishLocation: null,
        checklistTemplate: [],
        checklistResponses: [],
        notes: '',
        startedAt: null,
        errorMessage: null,
        lastSavedAt: null,
      },
      updateState: vi.fn(),
      clearState: vi.fn(),
      isRestored: true,
    });
  });

  it('blocks the flow when the appointment cannot be loaded', () => {
    mockUseInspectorAppointment.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useInspectorAppointment>);

    renderPage();

    expect(screen.getByText('Unable to load this appointment')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.queryByTestId('execution-page')).not.toBeInTheDocument();
  });

  it('does not move to IN_PROGRESS when online start fails', async () => {
    const user = userEvent.setup();
    const updateState = vi.fn();
    mockStartMutateAsync.mockRejectedValueOnce(new Error('Blocked by T-1 rule'));

    mockUseLocalExecutionState.mockReturnValue({
      state: {
        appointmentId: 'apt-1',
        phase: 'PRE_START',
        pendingSync: false,
        startLocation: null,
        finishLocation: null,
        checklistTemplate: [],
        checklistResponses: [],
        notes: '',
        startedAt: null,
        errorMessage: null,
        lastSavedAt: null,
      },
      updateState,
      clearState: vi.fn(),
      isRestored: true,
    });

    mockUseInspectorAppointment.mockReturnValue({
      data: {
        data: {
          id: 'apt-1',
          propertyAddress: '123 Main St',
          scheduledDate: '2099-12-31',
          timeSlotStart: '09:00',
          timeSlotEnd: '11:00',
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useInspectorAppointment>);

    renderPage();

    await user.click(screen.getByTestId('mock-start-button'));

    expect(updateState).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'IN_PROGRESS' }),
    );
    expect(mockShowError).toHaveBeenCalledWith('Blocked by T-1 rule');
  });

  it('keeps DONE locally with pending sync after offline finish instead of clearing state immediately', async () => {
    const user = userEvent.setup();
    const updateState = vi.fn();
    const clearState = vi.fn();
    mockFinishMutateAsync.mockResolvedValueOnce({
      data: { appointmentId: 'apt-1', status: 'QUEUED' },
    });

    mockUseLocalExecutionState.mockReturnValue({
      state: {
        appointmentId: 'apt-1',
        phase: 'FINISHING',
        pendingSync: false,
        startLocation: { latitude: -33.1, longitude: 151.2, accuracy: 10, capturedAt: '2026-03-24T09:00:00.000Z' },
        finishLocation: null,
        checklistTemplate: [],
        checklistResponses: [],
        notes: 'All good',
        startedAt: '2026-03-24T09:00:00.000Z',
        errorMessage: null,
        lastSavedAt: null,
      },
      updateState,
      clearState,
      isRestored: true,
    });

    mockUseInspectorAppointment.mockReturnValue({
      data: {
        data: {
          id: 'apt-1',
          propertyAddress: '123 Main St',
          scheduledDate: '2099-12-31',
          timeSlotStart: '09:00',
          timeSlotEnd: '11:00',
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useInspectorAppointment>);

    renderPage();

    await user.click(screen.getByTestId('mock-submit-button'));

    await waitFor(() =>
      expect(updateState).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'DONE', pendingSync: true }),
      ),
    );
    expect(clearState).not.toHaveBeenCalled();
  });

  describe('finish confirmation modals', () => {
    const finishingState = {
      appointmentId: 'apt-1',
      phase: 'FINISHING' as const,
      pendingSync: false,
      startLocation: {
        latitude: -33.1,
        longitude: 151.2,
        accuracy: 10,
        capturedAt: '2026-03-24T09:00:00.000Z',
      },
      finishLocation: null,
      checklistTemplate: [],
      checklistResponses: [],
      notes: '',
      startedAt: '2026-03-24T09:00:00.000Z',
      errorMessage: null,
      lastSavedAt: null,
    };

    function mockAppointment({
      jobDetails,
      ...overrides
    }: Record<string, unknown> = {}) {
      mockUseInspectorAppointment.mockReturnValue({
        data: {
          data: {
            id: 'apt-1',
            propertyAddress: '123 Main St',
            scheduledDate: '2099-12-31',
            timeSlotStart: '09:00',
            timeSlotEnd: '11:00',
            ...overrides,
          },
        },
        jobDetails,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as ReturnType<typeof useInspectorAppointment>);
    }

    const inspectionAppLink = { label: 'Inspection App', url: 'https://inspection.example.com' };

    beforeEach(() => {
      mockUseLocalExecutionState.mockReturnValue({
        state: finishingState,
        updateState: vi.fn(),
        clearState: vi.fn(),
        isRestored: true,
      });
      mockFinishMutateAsync.mockResolvedValue({
        data: { appointmentId: 'apt-1', status: 'DONE' },
      });
    });

    it('submits immediately without modals when there is no link and the window has not passed', async () => {
      const user = userEvent.setup();
      mockAppointment();

      renderPage();
      await user.click(screen.getByTestId('mock-submit-button'));

      await waitFor(() => expect(mockFinishMutateAsync).toHaveBeenCalledOnce());
      expect(screen.queryByTestId('sync-confirm-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('past-time-confirm-modal')).not.toBeInTheDocument();
    });

    it('shows the sync modal before submitting when the appointment has an Inspection App link', async () => {
      const user = userEvent.setup();
      mockAppointment({ jobDetails: { inspectionAppLink } });

      renderPage();
      await user.click(screen.getByTestId('mock-submit-button'));

      expect(screen.getByTestId('sync-confirm-modal')).toBeInTheDocument();
      expect(mockFinishMutateAsync).not.toHaveBeenCalled();

      await user.click(screen.getByTestId('sync-confirm-yes'));

      await waitFor(() => expect(mockFinishMutateAsync).toHaveBeenCalledOnce());
      expect(screen.queryByTestId('past-time-confirm-modal')).not.toBeInTheDocument();
    });

    it('cancels submission and guides the inspector when sync is declined', async () => {
      const user = userEvent.setup();
      mockAppointment({ jobDetails: { inspectionAppLink } });

      renderPage();
      await user.click(screen.getByTestId('mock-submit-button'));
      await user.click(screen.getByTestId('sync-confirm-no'));

      expect(screen.queryByTestId('sync-confirm-modal')).not.toBeInTheDocument();
      expect(mockFinishMutateAsync).not.toHaveBeenCalled();
      expect(mockShowInfo).toHaveBeenCalledWith(
        'Sync the inspection in the Inspection App before completing.',
      );
      expect(screen.getByTestId('mock-submit-button')).toBeInTheDocument();
    });

    it('chains sync confirmation into the past-time warning when the window has passed', async () => {
      const user = userEvent.setup();
      mockAppointment({ scheduledDate: '2020-01-01', jobDetails: { inspectionAppLink } });

      renderPage();
      await user.click(screen.getByTestId('mock-submit-button'));
      await user.click(screen.getByTestId('sync-confirm-yes'));

      expect(screen.getByTestId('past-time-confirm-modal')).toBeInTheDocument();
      expect(mockFinishMutateAsync).not.toHaveBeenCalled();

      await user.click(screen.getByTestId('past-time-confirm'));

      await waitFor(() => expect(mockFinishMutateAsync).toHaveBeenCalledOnce());
    });

    it('does not submit when the past-time warning is cancelled', async () => {
      const user = userEvent.setup();
      mockAppointment({ scheduledDate: '2020-01-01', jobDetails: { inspectionAppLink } });

      renderPage();
      await user.click(screen.getByTestId('mock-submit-button'));
      await user.click(screen.getByTestId('sync-confirm-yes'));
      await user.click(screen.getByTestId('past-time-cancel'));

      expect(screen.queryByTestId('past-time-confirm-modal')).not.toBeInTheDocument();
      expect(mockFinishMutateAsync).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-submit-button')).toBeInTheDocument();
    });

    it('shows the past-time warning directly when there is no Inspection App link', async () => {
      const user = userEvent.setup();
      mockAppointment({ scheduledDate: '2020-01-01' });

      renderPage();
      await user.click(screen.getByTestId('mock-submit-button'));

      expect(screen.queryByTestId('sync-confirm-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('past-time-confirm-modal')).toBeInTheDocument();
      expect(mockFinishMutateAsync).not.toHaveBeenCalled();

      await user.click(screen.getByTestId('past-time-confirm'));

      await waitFor(() => expect(mockFinishMutateAsync).toHaveBeenCalledOnce());
    });
  });
});
