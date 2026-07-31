import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RescheduleGroupModal } from './RescheduleGroupModal';
import type { ServiceGroupAppointment, ServiceGroupDetail } from '../types';

const mockReschedule = vi.fn();
vi.mock('../hooks/useRescheduleServiceGroup', () => ({
  useRescheduleServiceGroup: () => ({ reschedule: mockReschedule, isRescheduling: false }),
}));

function makeAppointment(overrides: Partial<ServiceGroupAppointment> = {}): ServiceGroupAppointment {
  return {
    id: 'apt-1',
    appointmentNumber: 1001,
    status: 'SCHEDULED',
    scheduledDate: '2030-06-01',
    timeSlotStart: '10:00',
    timeSlotEnd: '11:00',
    rentalTenantConfirmationStatus: 'PENDING',
    propertyAddress: '10 Main St',
    propertyCode: 'PROP-001',
    ...overrides,
  };
}

function makeGroup(overrides: Partial<ServiceGroupDetail> = {}): ServiceGroupDetail {
  return {
    id: 'sg-1',
    tenantId: 'tenant-1',
    serviceRegionId: null,
    regionName: 'Inner West',
    inspectorId: null,
    inspectorName: null,
    status: 'PUBLISHED',
    appointmentsCount: 1,
    scheduledDate: '2030-06-01',
    timeWindow: '09:00-17:00',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    appointments: [makeAppointment()],
    description: null,
    ...overrides,
  } as ServiceGroupDetail;
}

function renderModal(group: ServiceGroupDetail = makeGroup(), mode: 'date' | 'time-window' = 'date') {
  return render(
    <RescheduleGroupModal
      open
      mode={mode}
      onClose={vi.fn()}
      serviceGroup={group}
      onSaved={vi.fn()}
    />,
  );
}

const dateInput = () => screen.getByLabelText('Scheduled date') as HTMLInputElement;
const startInput = () => screen.getByLabelText('Start time') as HTMLInputElement;
const endInput = () => screen.getByLabelText('End time') as HTMLInputElement;
const applyButton = () => screen.getByRole('button', { name: /Apply changes/ });

describe('RescheduleGroupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills the group current date and window', () => {
    renderModal();
    expect(dateInput().value).toBe('01/06/2030');
    expect(startInput().value).toBe('9:00 am');
    expect(endInput().value).toBe('5:00 pm');
  });

  it('rejects a past date at submit instead of calling reschedule', () => {
    // DateInput's `min` flags but still emits, so the guard has to live here.
    renderModal();
    fireEvent.change(dateInput(), { target: { value: '2020-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(screen.getByText('Scheduled date cannot be in the past')).toBeInTheDocument();
    expect(mockReschedule).not.toHaveBeenCalled();
  });

  it('titles itself by the entry point but keeps both fields editable', () => {
    renderModal(makeGroup(), 'time-window');
    expect(screen.getByText('Change time window')).toBeInTheDocument();
    // The date field is present even though the operator came in via the window
    // item — changing both at once must still be previewed together.
    expect(dateInput()).toBeInTheDocument();
  });

  it('keeps Apply disabled until something actually differs', () => {
    renderModal();
    expect(applyButton()).toBeDisabled();
  });

  it('sends only the date when only the date changed', () => {
    renderModal();
    fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });
    fireEvent.click(applyButton());

    expect(mockReschedule).toHaveBeenCalledTimes(1);
    const payload = mockReschedule.mock.calls[0]![0];
    expect(payload).toMatchObject({ scheduledDate: '2030-07-20' });
    // The promise the date-only path makes: no time key reaches the API.
    expect(payload).not.toHaveProperty('timeWindow');
  });

  it('promises unchanged time slots on a date-only change', () => {
    renderModal();
    fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });
    expect(screen.getByTestId('reschedule-group-date-warning')).toHaveTextContent(
      'Time slots are unchanged',
    );
  });

  it('sends only the window when only the window changed', () => {
    renderModal();
    fireEvent.change(startInput(), { target: { value: '08:00' } });
    fireEvent.change(endInput(), { target: { value: '12:00' } });
    fireEvent.click(applyButton());

    const payload = mockReschedule.mock.calls[0]![0];
    expect(payload).toMatchObject({ timeWindow: '08:00-12:00' });
    expect(payload).not.toHaveProperty('scheduledDate');
  });

  it('sends both keys when the operator changed both at once', () => {
    renderModal();
    fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });
    fireEvent.change(startInput(), { target: { value: '08:00' } });
    fireEvent.change(endInput(), { target: { value: '12:00' } });
    fireEvent.click(applyButton());

    expect(mockReschedule.mock.calls[0]![0]).toMatchObject({
      scheduledDate: '2030-07-20',
      timeWindow: '08:00-12:00',
    });
  });

  it('names exactly the appointments that fall outside the new window', () => {
    const group = makeGroup({
      appointments: [
        makeAppointment({ id: 'inside', propertyCode: 'PROP-INSIDE', timeSlotStart: '13:00', timeSlotEnd: '14:00' }),
        makeAppointment({ id: 'early', propertyCode: 'PROP-EARLY', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
      ],
    });
    renderModal(group, 'time-window');

    fireEvent.change(startInput(), { target: { value: '12:00' } });
    fireEvent.change(endInput(), { target: { value: '15:00' } });

    const banner = screen.getByTestId('reschedule-group-clamp-warning');
    expect(banner).toHaveTextContent('PROP-EARLY');
    expect(banner).not.toHaveTextContent('PROP-INSIDE');
    expect(banner).toHaveTextContent('1 appointment(s) are already inside the new window');
  });

  it('says so when a widened window changes nothing', () => {
    renderModal(makeGroup(), 'time-window');
    fireEvent.change(startInput(), { target: { value: '06:00' } });
    fireEvent.change(endInput(), { target: { value: '20:00' } });

    expect(screen.getByTestId('reschedule-group-no-clamp')).toBeInTheDocument();
    expect(screen.queryByTestId('reschedule-group-clamp-warning')).not.toBeInTheDocument();
  });

  describe('tenant confirmations', () => {
    const confirmedGroup = () =>
      makeGroup({
        appointments: [makeAppointment({ rentalTenantConfirmationStatus: 'CONFIRMED' })],
      });

    it('blocks Apply until the operator picks a strategy', () => {
      renderModal(confirmedGroup());
      fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });

      expect(screen.getByTestId('reschedule-group-confirmation-choice')).toBeInTheDocument();
      expect(applyButton()).toBeDisabled();
    });

    it('sends the chosen strategy', () => {
      renderModal(confirmedGroup());
      fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });
      fireEvent.click(screen.getByRole('radio', { name: /Resend confirmation/ }));

      expect(applyButton()).toBeEnabled();
      fireEvent.click(applyButton());
      expect(mockReschedule.mock.calls[0]![0]).toMatchObject({ confirmationStrategy: 'RESEND' });
    });

    it('does not ask when no confirmation is at stake', () => {
      renderModal();
      fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });

      expect(screen.queryByTestId('reschedule-group-confirmation-choice')).not.toBeInTheDocument();
      fireEvent.click(applyButton());
      // The API requires the field; the non-destructive option is the default.
      expect(mockReschedule.mock.calls[0]![0]).toMatchObject({ confirmationStrategy: 'NOTIFY_ONLY' });
    });

    it('does not ask on a DRAFT group — nothing was ever sent to a tenant', () => {
      renderModal(makeGroup({
        status: 'DRAFT',
        appointments: [makeAppointment({ rentalTenantConfirmationStatus: 'CONFIRMED' })],
      }));
      fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });

      expect(screen.queryByTestId('reschedule-group-confirmation-choice')).not.toBeInTheDocument();
    });
  });
});

describe('RescheduleGroupModal terminal members', () => {
  it('never promises to move a completed inspection', () => {
    renderModal(
      makeGroup({
        appointments: [
          makeAppointment({ id: 'done', propertyCode: 'PROP-DONE', status: 'DONE', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
          makeAppointment({ id: 'live', propertyCode: 'PROP-LIVE', status: 'SCHEDULED', timeSlotStart: '09:30', timeSlotEnd: '10:30' }),
        ],
      }),
      'time-window',
    );

    fireEvent.change(startInput(), { target: { value: '12:00' } });
    fireEvent.change(endInput(), { target: { value: '15:00' } });

    const banner = screen.getByTestId('reschedule-group-clamp-warning');
    expect(banner).toHaveTextContent('PROP-LIVE');
    expect(banner).not.toHaveTextContent('PROP-DONE');
  });

  it('counts only the live members in the date-move warning', () => {
    renderModal(
      makeGroup({
        appointments: [
          makeAppointment({ id: 'done', status: 'DONE' }),
          makeAppointment({ id: 'live', status: 'SCHEDULED' }),
        ],
      }),
    );

    fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });
    expect(screen.getByTestId('reschedule-group-date-warning')).toHaveTextContent(
      '1 appointment(s) will be moved',
    );
  });

  it('does not ask about a confirmation on a completed inspection', () => {
    renderModal(
      makeGroup({
        appointments: [
          makeAppointment({ id: 'done', status: 'DONE', rentalTenantConfirmationStatus: 'CONFIRMED' }),
        ],
      }),
    );

    fireEvent.change(dateInput(), { target: { value: '2030-07-20' } });
    expect(screen.queryByTestId('reschedule-group-confirmation-choice')).not.toBeInTheDocument();
  });
});
