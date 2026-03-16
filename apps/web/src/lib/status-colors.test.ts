import { describe, it, expect } from 'vitest';
import { AppointmentStatus } from '@properfy/shared';
import { APPOINTMENT_STATUS_MAP, getStatusStyle } from './status-colors';

describe('APPOINTMENT_STATUS_MAP', () => {
  const allStatuses: AppointmentStatus[] = [
    AppointmentStatus.DRAFT,
    AppointmentStatus.AWAITING_INSPECTOR,
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.DONE,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.REJECTED,
  ];

  it('maps all 6 appointment statuses', () => {
    expect(Object.keys(APPOINTMENT_STATUS_MAP)).toHaveLength(6);
    for (const status of allStatuses) {
      expect(APPOINTMENT_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = APPOINTMENT_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.DRAFT].label).toBe('Rascunho');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.AWAITING_INSPECTOR].label).toBe('Aguardando Inspetor');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.SCHEDULED].label).toBe('Agendado');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.DONE].label).toBe('Concluído');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.CANCELLED].label).toBe('Cancelado');
    expect(APPOINTMENT_STATUS_MAP[AppointmentStatus.REJECTED].label).toBe('Rejeitado');
  });

  it('getStatusStyle returns the correct style', () => {
    const style = getStatusStyle(AppointmentStatus.DONE);
    expect(style.bg).toBe('var(--color-status-done)');
    expect(style.label).toBe('Concluído');
  });
});
