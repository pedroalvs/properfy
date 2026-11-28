import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MoveToGroupModal, type MoveToGroupAppointment } from './MoveToGroupModal';

const mockFindTargets = vi.fn();
const mockMove = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));
vi.mock('../hooks/useFindMoveTargetGroups', () => ({
  useFindMoveTargetGroups: () => ({ mutateAsync: mockFindTargets }),
}));
vi.mock('../hooks/useMoveAppointmentsToGroup', () => ({
  useMoveAppointmentsToGroup: () => ({ move: mockMove, isPending: false }),
}));

const appts: MoveToGroupAppointment[] = [{ id: 'appt-1', code: 'A-1', scheduledDate: '2026-08-05' }];

const futureGroup = {
  id: 'group-future', groupNumber: 7, code: '7', status: 'PUBLISHED',
  scheduledDate: '2026-08-20', timeWindow: '09:00-12:00', currentSize: 3, serviceTypeName: 'Routine', isCurrentDay: false,
};
const todayGroup = { ...futureGroup, id: 'group-today', code: '9', scheduledDate: '2026-08-05', isCurrentDay: true };

beforeEach(() => {
  mockFindTargets.mockReset().mockResolvedValue({ data: { groups: [futureGroup] } });
  mockMove.mockReset().mockResolvedValue({ results: [{ appointmentId: 'appt-1', status: 'OK' }], movedCount: 1 });
  mockShowSuccess.mockReset();
  mockShowError.mockReset();
});

async function pickGroup(label: string) {
  fireEvent.click(screen.getByLabelText('Destination group'));
  fireEvent.click(screen.getByText(label));
}

describe('MoveToGroupModal', () => {
  it('moves the selected appointments and shows a success snackbar', async () => {
    render(<MoveToGroupModal open onClose={() => {}} appointments={appts} />);
    await waitFor(() => expect(screen.getByLabelText('Destination group')).toBeInTheDocument());
    await pickGroup('Group 7 · 20/08/2026 · 9:00 am – 12:00 pm (3 appts)');
    fireEvent.click(screen.getByTestId('move-to-group-confirm'));
    await waitFor(() => expect(mockMove).toHaveBeenCalledWith('group-future', ['appt-1']));
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('warns that a current-day destination confirms the tenant', async () => {
    mockFindTargets.mockResolvedValue({ data: { groups: [todayGroup] } });
    render(<MoveToGroupModal open onClose={() => {}} appointments={appts} />);
    await waitFor(() => expect(screen.getByLabelText('Destination group')).toBeInTheDocument());
    await pickGroup('Group 9 · 05/08/2026 · 9:00 am – 12:00 pm (3 appts)');
    expect(screen.getByTestId('move-to-group-current-day-banner')).toBeInTheDocument();
  });

  it('warns when the group date differs from the appointment date', async () => {
    render(<MoveToGroupModal open onClose={() => {}} appointments={appts} />);
    await waitFor(() => expect(screen.getByLabelText('Destination group')).toBeInTheDocument());
    await pickGroup('Group 7 · 20/08/2026 · 9:00 am – 12:00 pm (3 appts)');
    expect(screen.getByTestId('move-to-group-date-sync-banner')).toBeInTheDocument();
  });

  it('shows the NOT_GROUPED guidance when the selection is not grouped', async () => {
    mockFindTargets.mockResolvedValue({ data: { groups: [], reason: 'NOT_GROUPED' } });
    render(<MoveToGroupModal open onClose={() => {}} appointments={appts} />);
    await waitFor(() => expect(screen.getByTestId('move-to-group-not-grouped-banner')).toBeInTheDocument());
  });

  it('renders per-item failures in the result envelope', async () => {
    mockMove.mockResolvedValue({
      results: [
        { appointmentId: 'appt-1', status: 'OK' },
        { appointmentId: 'appt-2', status: 'SOURCE_GROUP_NOT_ACTIVE', error: { code: 'SOURCE_GROUP_NOT_ACTIVE', message: 'not active' } },
      ],
      movedCount: 1,
    });
    render(<MoveToGroupModal open onClose={() => {}} appointments={[...appts, { id: 'appt-2', code: 'A-2', scheduledDate: '2026-08-20' }]} />);
    await waitFor(() => expect(screen.getByLabelText('Destination group')).toBeInTheDocument());
    await pickGroup('Group 7 · 20/08/2026 · 9:00 am – 12:00 pm (3 appts)');
    fireEvent.click(screen.getByTestId('move-to-group-confirm'));
    await waitFor(() => expect(screen.getByTestId('move-to-group-result')).toBeInTheDocument());
    expect(screen.getByText(/not active/)).toBeInTheDocument();
  });
});
