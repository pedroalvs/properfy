import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentCard } from '../AppointmentCard';
import { renderWithProviders } from '@/test-utils';
import { AppointmentStatus, TenantConfirmationStatus, ServiceTypeFlowType } from '@properfy/shared';
import type { InspectorAppointment } from '../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const baseAppointment: InspectorAppointment = {
  id: 'apt-1',
  propertyAddress: '123 Collins St',
  suburb: 'Melbourne',
  scheduledDate: '2026-03-18',
  timeSlot: '09:00-11:00',
  timeSlotStart: '2026-03-18T09:00:00.000Z',
  timeSlotEnd: '2026-03-18T11:00:00.000Z',
  status: AppointmentStatus.SCHEDULED,
  tenantConfirmation: TenantConfirmationStatus.CONFIRMED,
  serviceTypeName: 'Routine Inspection',
  flowType: ServiceTypeFlowType.ROUTINE,
  tenantName: 'John Doe',
  tenantPhone: '+61400000000',
  tenantEmail: 'john@test.com',
  keyRequired: false,
  meetingLocation: null,
  restrictions: null,
  propertyLatitude: -37.8136,
  propertyLongitude: 144.9631,
  notes: null,
};

describe('AppointmentCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders appointment details', () => {
    renderWithProviders(<AppointmentCard appointment={baseAppointment} />);
    expect(screen.getByText('123 Collins St, Melbourne')).toBeInTheDocument();
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
  });

  it('shows time window', () => {
    renderWithProviders(<AppointmentCard appointment={baseAppointment} />);
    expect(screen.getByText('09:00 – 11:00')).toBeInTheDocument();
  });

  it('shows confirmation badge', () => {
    renderWithProviders(<AppointmentCard appointment={baseAppointment} />);
    expect(screen.getByTestId('confirmation-badge')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('shows T-1 warning for unconfirmed routine today', () => {
    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const apt: InspectorAppointment = {
      ...baseAppointment,
      scheduledDate: todayDate,
      timeSlotStart: `${todayDate}T09:00:00.000Z`,
      tenantConfirmation: TenantConfirmationStatus.PENDING,
      flowType: ServiceTypeFlowType.ROUTINE,
    };
    renderWithProviders(<AppointmentCard appointment={apt} />);
    expect(screen.getByTestId('t1-warning')).toBeInTheDocument();
  });

  it('does not show T-1 warning for confirmed routine', () => {
    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const apt: InspectorAppointment = {
      ...baseAppointment,
      scheduledDate: todayDate,
      timeSlotStart: `${todayDate}T09:00:00.000Z`,
      tenantConfirmation: TenantConfirmationStatus.CONFIRMED,
    };
    renderWithProviders(<AppointmentCard appointment={apt} />);
    expect(screen.queryByTestId('t1-warning')).not.toBeInTheDocument();
  });

  it('does not show T-1 warning for non-routine', () => {
    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const apt: InspectorAppointment = {
      ...baseAppointment,
      scheduledDate: todayDate,
      timeSlotStart: `${todayDate}T09:00:00.000Z`,
      tenantConfirmation: TenantConfirmationStatus.PENDING,
      flowType: ServiceTypeFlowType.INGOING,
    };
    renderWithProviders(<AppointmentCard appointment={apt} />);
    expect(screen.queryByTestId('t1-warning')).not.toBeInTheDocument();
  });

  it('shows key badge when key required', () => {
    renderWithProviders(
      <AppointmentCard appointment={{ ...baseAppointment, keyRequired: true }} />,
    );
    expect(screen.getByText('Key required')).toBeInTheDocument();
  });

  it('navigates to detail on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppointmentCard appointment={baseAppointment} />);
    await user.click(screen.getByTestId('appointment-card-apt-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/schedule/apt-1');
  });

  it('has primary left border for SCHEDULED status', () => {
    renderWithProviders(<AppointmentCard appointment={baseAppointment} />);
    const card = screen.getByTestId('appointment-card-apt-1');
    expect(card.className).toContain('border-l-primary');
  });

  it('has muted left border for DONE status', () => {
    const apt = { ...baseAppointment, status: AppointmentStatus.DONE };
    renderWithProviders(<AppointmentCard appointment={apt} />);
    const card = screen.getByTestId('appointment-card-apt-1');
    expect(card.className).toContain('border-l-text-muted');
  });

  it('has error left border for CANCELLED status', () => {
    const apt = { ...baseAppointment, status: AppointmentStatus.CANCELLED };
    renderWithProviders(<AppointmentCard appointment={apt} />);
    const card = screen.getByTestId('appointment-card-apt-1');
    expect(card.className).toContain('border-l-error');
  });

  it('shows overdue badge when isOverdue is true', () => {
    const apt: InspectorAppointment = { ...baseAppointment, isOverdue: true };
    renderWithProviders(<AppointmentCard appointment={apt} />);
    expect(screen.getByTestId('overdue-badge')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('does not show overdue badge when isOverdue is false', () => {
    const apt: InspectorAppointment = { ...baseAppointment, isOverdue: false };
    renderWithProviders(<AppointmentCard appointment={apt} />);
    expect(screen.queryByTestId('overdue-badge')).not.toBeInTheDocument();
  });
});
