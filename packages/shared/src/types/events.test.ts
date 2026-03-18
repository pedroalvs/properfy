import { describe, it, expect } from 'vitest';
import type {
  DomainEvent,
  AppointmentStatusChangedPayload,
  ServiceGroupAcceptedPayload,
  NotificationFailedPayload,
  FinancialEntriesCreatedPayload,
} from './events';

describe('DomainEvent types', () => {
  it('can construct a valid DomainEvent', () => {
    const event: DomainEvent<AppointmentStatusChangedPayload> = {
      type: 'appointment.status_changed',
      payload: {
        appointmentId: '123',
        previousStatus: 'SCHEDULED',
        newStatus: 'DONE',
      },
      occurredAt: new Date().toISOString(),
    };
    expect(event.type).toBe('appointment.status_changed');
    expect(event.payload.appointmentId).toBe('123');
  });

  it('can construct ServiceGroupAcceptedPayload', () => {
    const payload: ServiceGroupAcceptedPayload = {
      serviceGroupId: 'sg-1',
      inspectorId: 'insp-1',
      appointmentIds: ['apt-1', 'apt-2'],
    };
    expect(payload.appointmentIds).toHaveLength(2);
  });

  it('can construct NotificationFailedPayload', () => {
    const payload: NotificationFailedPayload = {
      notificationId: 'n-1',
      channel: 'EMAIL',
      errorMessage: 'Provider timeout',
      retryCount: 3,
    };
    expect(payload.retryCount).toBe(3);
  });

  it('can construct FinancialEntriesCreatedPayload', () => {
    const payload: FinancialEntriesCreatedPayload = {
      appointmentId: 'apt-1',
      entries: [{ id: 'fe-1', type: 'TENANT_DEBIT', amount: 150 }],
    };
    expect(payload.entries).toHaveLength(1);
  });
});
