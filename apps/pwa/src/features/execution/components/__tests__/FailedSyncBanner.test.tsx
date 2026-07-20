import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FailedSyncBanner } from '../FailedSyncBanner';

const mockRetryAction = vi.fn();
const mockUseOfflineQueue = vi.fn();

vi.mock('../../hooks/useOfflineQueue', () => ({
  useOfflineQueue: () => mockUseOfflineQueue(),
}));

describe('FailedSyncBanner', () => {
  beforeEach(() => {
    mockRetryAction.mockReset();
    mockUseOfflineQueue.mockReset();
  });

  it('renders nothing when there are no failed actions', () => {
    mockUseOfflineQueue.mockReturnValue({
      failedActions: [],
      retryAction: mockRetryAction,
      processQueue: vi.fn(),
    });

    render(<FailedSyncBanner />);

    expect(screen.queryByTestId('failed-sync-banner')).not.toBeInTheDocument();
  });

  it('shows the failed sync message with the last error and retries on click', () => {
    mockUseOfflineQueue.mockReturnValue({
      failedActions: [
        {
          id: 'action-1',
          type: 'FINISH',
          appointmentId: 'apt-1',
          payload: {},
          idempotencyKey: 'key-1',
          createdAt: '2026-03-25T10:00:00.000Z',
          retryCount: 4,
          lastError: 'Geofence mismatch',
          status: 'FAILED',
        },
      ],
      retryAction: mockRetryAction,
      processQueue: vi.fn(),
    });

    render(<FailedSyncBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A queued inspection sync failed: Geofence mismatch',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockRetryAction).toHaveBeenCalledWith('action-1');
  });
});
