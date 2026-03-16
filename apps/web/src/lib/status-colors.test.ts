import { describe, it, expect } from 'vitest';
import { AppointmentStatus, PropertyType, InspectorStatus } from '@properfy/shared';
import { APPOINTMENT_STATUS_MAP, getStatusStyle, PROPERTY_TYPE_MAP, INSPECTOR_STATUS_MAP } from './status-colors';

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

describe('PROPERTY_TYPE_MAP', () => {
  const allTypes: PropertyType[] = [
    PropertyType.RESIDENTIAL,
    PropertyType.COMMERCIAL,
    PropertyType.INDUSTRIAL,
    PropertyType.RURAL,
  ];

  it('maps all 4 property types', () => {
    expect(Object.keys(PROPERTY_TYPE_MAP)).toHaveLength(4);
    for (const type of allTypes) {
      expect(PROPERTY_TYPE_MAP[type]).toBeDefined();
    }
  });

  it.each(allTypes)('type %s has bg, text, and label', (type) => {
    const style = PROPERTY_TYPE_MAP[type];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(PROPERTY_TYPE_MAP[PropertyType.RESIDENTIAL].label).toBe('Residencial');
    expect(PROPERTY_TYPE_MAP[PropertyType.COMMERCIAL].label).toBe('Comercial');
    expect(PROPERTY_TYPE_MAP[PropertyType.INDUSTRIAL].label).toBe('Industrial');
    expect(PROPERTY_TYPE_MAP[PropertyType.RURAL].label).toBe('Rural');
  });
});

describe('INSPECTOR_STATUS_MAP', () => {
  const allStatuses: InspectorStatus[] = [
    InspectorStatus.ACTIVE,
    InspectorStatus.INACTIVE,
  ];

  it('maps both inspector statuses', () => {
    expect(Object.keys(INSPECTOR_STATUS_MAP)).toHaveLength(2);
    for (const status of allStatuses) {
      expect(INSPECTOR_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = INSPECTOR_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(INSPECTOR_STATUS_MAP[InspectorStatus.ACTIVE].label).toBe('Ativo');
    expect(INSPECTOR_STATUS_MAP[InspectorStatus.INACTIVE].label).toBe('Inativo');
  });
});
