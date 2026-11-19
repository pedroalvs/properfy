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

  it('does not offer Retry for a permanently-failed item (F03 / FR-026)', () => {
    mockUseOfflineQueue.mockReturnValue({
      failedActions: [
        {
          id: 'action-geo',
          type: 'START',
          appointmentId: 'apt-1',
          payload: {},
          idempotencyKey: 'key-1',
          createdAt: '2026-03-25T10:00:00.000Z',
          retryCount: 1,
          lastError:
            "You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations. Check in again when you're at the property.",
          status: 'FAILED',
          permanent: true,
        },
      ],
      retryAction: mockRetryAction,
      processQueue: vi.fn(),
    });

    render(<FailedSyncBanner />);

    expect(screen.getByRole('alert')).toHaveTextContent('only allowed within 300 m');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
