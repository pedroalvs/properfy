import { render, screen, fireEvent } from '@testing-library/react';
import { ServiceTypeFlowType } from '@properfy/shared';
import { ScheduleHistoryList } from '../ScheduleHistoryList';
import type { HistoryItem } from '../../hooks/useScheduleHistory';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const makeItem = (overrides: Partial<HistoryItem> = {}): HistoryItem => ({
  id: '00000000-0000-0000-0000-000000000001',
  appointmentCode: 'INS-0001',
  status: 'DONE',
  scheduledDate: '2026-04-01',
  timeSlotStart: '08:00',
  timeSlotEnd: '12:00',
  serviceTypeId: '00000000-0000-0000-0000-000000000099',
  propertyId: '00000000-0000-0000-0000-000000000088',
  rentalTenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  executionStatus: 'FINISHED',
  agencyName: 'Test Agency',
  propertyAddress: '1 Test St',
  suburb: 'Suburbia',
  serviceTypeName: 'Routine Inspection',
  flowType: ServiceTypeFlowType.ROUTINE,
  ...overrides,
});

const items = [
  makeItem({ id: '00000000-0000-0000-0000-000000000001', scheduledDate: '2026-04-01', appointmentCode: 'INS-0001' }),
  makeItem({ id: '00000000-0000-0000-0000-000000000002', scheduledDate: '2026-04-01', appointmentCode: 'INS-0002' }),
  makeItem({ id: '00000000-0000-0000-0000-000000000003', scheduledDate: '2026-03-15', appointmentCode: 'INS-0003' }),
];

describe('ScheduleHistoryList', () => {
  beforeEach(() => { mockNavigate.mockClear(); });

  it('renders an AppointmentCard per item', () => {
    render(<ScheduleHistoryList items={items} />);
    expect(screen.getByTestId(`appointment-card-${items[0]!.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`appointment-card-${items[1]!.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`appointment-card-${items[2]!.id}`)).toBeInTheDocument();
    expect(screen.getByText('INS-0001')).toBeInTheDocument();
  });

  it('shows address and service type on the cards', () => {
    render(<ScheduleHistoryList items={[items[0]!]} />);
    expect(screen.getByText('1 Test St, Suburbia')).toBeInTheDocument();
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
  });

  it('renders a date header for each unique date', () => {
    render(<ScheduleHistoryList items={items} />);
    const headers = screen.getAllByTestId('history-date-header');
    expect(headers).toHaveLength(2);
  });

  it('shows agency name in each card', () => {
    render(<ScheduleHistoryList items={items} />);
    const names = screen.getAllByText('Test Agency');
    expect(names).toHaveLength(3);
  });

  it('renders shared empty state when items is empty', () => {
    render(<ScheduleHistoryList items={[]} />);
    expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    expect(screen.getByText('No completed inspections')).toBeInTheDocument();
  });

  it('navigates to /schedule/:id when a card is clicked', () => {
    render(<ScheduleHistoryList items={[items[0]!]} />);
    fireEvent.click(screen.getByTestId(`appointment-card-${items[0]!.id}`));
    expect(mockNavigate).toHaveBeenCalledWith(`/schedule/${items[0]!.id}`);
  });
});
