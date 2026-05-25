import { render, screen } from '@testing-library/react';
import { ScheduleHistoryList } from '../ScheduleHistoryList';

const makeItem = (overrides: Partial<(typeof items)[0]> = {}) => ({
  id: '00000000-0000-0000-0000-000000000001',
  appointmentCode: 'INS-0001',
  status: 'DONE',
  scheduledDate: '2026-04-01',
  timeSlot: '08:00-12:00',
  serviceTypeId: '00000000-0000-0000-0000-000000000099',
  propertyId: '00000000-0000-0000-0000-000000000088',
  tenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  executionStatus: 'FINISHED' as const,
  agencyName: 'Test Agency',
  ...overrides,
});

const items = [
  makeItem({ id: '00000000-0000-0000-0000-000000000001', scheduledDate: '2026-04-01', appointmentCode: 'INS-0001' }),
  makeItem({ id: '00000000-0000-0000-0000-000000000002', scheduledDate: '2026-04-01', appointmentCode: 'INS-0002' }),
  makeItem({ id: '00000000-0000-0000-0000-000000000003', scheduledDate: '2026-03-15', appointmentCode: 'INS-0003' }),
];

describe('ScheduleHistoryList', () => {
  it('renders all appointment rows', () => {
    render(<ScheduleHistoryList items={items} />);
    expect(screen.getByText('INS-0001')).toBeInTheDocument();
    expect(screen.getByText('INS-0002')).toBeInTheDocument();
    expect(screen.getByText('INS-0003')).toBeInTheDocument();
  });

  it('renders a date header for each unique date', () => {
    render(<ScheduleHistoryList items={items} />);
    const headers = screen.getAllByTestId('history-date-header');
    expect(headers).toHaveLength(2);
  });

  it('renders Done chip for each row', () => {
    render(<ScheduleHistoryList items={items} />);
    const chips = screen.getAllByTestId('status-chip-done');
    expect(chips).toHaveLength(3);
  });

  it('shows agency name in each row', () => {
    render(<ScheduleHistoryList items={items} />);
    const names = screen.getAllByText('Test Agency');
    expect(names).toHaveLength(3);
  });

  it('renders empty state when items is empty', () => {
    render(<ScheduleHistoryList items={[]} />);
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
  });
});
