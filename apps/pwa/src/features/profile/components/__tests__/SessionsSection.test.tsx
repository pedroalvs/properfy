import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionsSection } from '../SessionsSection';

const mockUseSessions = vi.fn();

vi.mock('../../hooks/useSessions', () => ({
  useSessions: () => mockUseSessions(),
}));

describe('SessionsSection', () => {
  beforeEach(() => {
    mockUseSessions.mockReturnValue({
      sessions: [
        {
          id: 'session-1',
          userAgent: 'Mozilla/5.0 (Macintosh)',
          ipAddress: '127.0.0.1',
          createdAt: '2026-03-24T10:00:00Z',
          isCurrent: true,
        },
        {
          id: 'session-2',
          userAgent: 'Mozilla/5.0 (iPhone)',
          ipAddress: '127.0.0.2',
          createdAt: '2026-03-24T11:00:00Z',
          isCurrent: false,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokingId: null,
    });
  });

  it('shows honest session timing and revoke action', async () => {
    const revokeSession = vi.fn().mockResolvedValue(undefined);
    mockUseSessions.mockReturnValue({
      sessions: [
        {
          id: 'session-1',
          userAgent: 'Mozilla/5.0 (Macintosh)',
          ipAddress: '127.0.0.1',
          createdAt: '2026-03-24T10:00:00Z',
          isCurrent: true,
        },
        {
          id: 'session-2',
          userAgent: 'Mozilla/5.0 (iPhone)',
          ipAddress: '127.0.0.2',
          createdAt: '2026-03-24T11:00:00Z',
          isCurrent: false,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      revokeSession,
      revokingId: null,
    });

    render(<SessionsSection />);
    fireEvent.click(screen.getByRole('button', { name: /active sessions/i }));

    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getAllByText(/Started/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeSession).toHaveBeenCalledWith('session-2');
    });
  });

  it('classifies a real iPad Safari user agent as Tablet, not Mobile', () => {
    // iPadOS 13+ Safari UAs include "Mobile", so a naive Mobile-first check
    // would misclassify this as a phone.
    const IPAD_SAFARI_UA =
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
      'Version/17.4 Mobile/15E148 Safari/604.1';

    mockUseSessions.mockReturnValue({
      sessions: [
        {
          id: 'session-ipad',
          userAgent: IPAD_SAFARI_UA,
          ipAddress: '127.0.0.3',
          createdAt: '2026-03-24T12:00:00Z',
          isCurrent: false,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      revokeSession: vi.fn().mockResolvedValue(undefined),
      revokingId: null,
    });

    render(<SessionsSection />);
    fireEvent.click(screen.getByRole('button', { name: /active sessions/i }));

    expect(screen.getByText('Tablet')).toBeInTheDocument();
    expect(screen.queryByText('Mobile')).not.toBeInTheDocument();
  });
});
