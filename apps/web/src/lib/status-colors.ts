import { AppointmentStatus, PropertyType, InspectorStatus } from '@properfy/shared';

export interface StatusStyle {
  bg: string;
  text: string;
  label: string;
}

export const APPOINTMENT_STATUS_MAP: Record<AppointmentStatus, StatusStyle> = {
  [AppointmentStatus.DRAFT]: {
    bg: 'var(--color-status-draft)',
    text: 'var(--color-text-primary)',
    label: 'Rascunho',
  },
  [AppointmentStatus.AWAITING_INSPECTOR]: {
    bg: 'var(--color-status-awaiting-inspector)',
    text: 'var(--color-text-primary)',
    label: 'Aguardando Inspetor',
  },
  [AppointmentStatus.SCHEDULED]: {
    bg: 'var(--color-status-scheduled)',
    text: 'var(--color-text-primary)',
    label: 'Agendado',
  },
  [AppointmentStatus.DONE]: {
    bg: 'var(--color-status-done)',
    text: 'var(--color-text-primary)',
    label: 'Concluído',
  },
  [AppointmentStatus.CANCELLED]: {
    bg: 'var(--color-status-cancelled)',
    text: 'var(--color-text-primary)',
    label: 'Cancelado',
  },
  [AppointmentStatus.REJECTED]: {
    bg: 'var(--color-status-rejected)',
    text: 'var(--color-text-primary)',
    label: 'Rejeitado',
  },
};

export function getStatusStyle(status: AppointmentStatus): StatusStyle {
  return APPOINTMENT_STATUS_MAP[status];
}

export const PROPERTY_TYPE_MAP: Record<PropertyType, StatusStyle> = {
  [PropertyType.RESIDENTIAL]: { bg: 'var(--color-type-residential)', text: 'var(--color-text-primary)', label: 'Residencial' },
  [PropertyType.COMMERCIAL]:  { bg: 'var(--color-type-commercial)',  text: 'var(--color-text-primary)', label: 'Comercial' },
  [PropertyType.INDUSTRIAL]:  { bg: 'var(--color-type-industrial)',  text: 'var(--color-text-primary)', label: 'Industrial' },
  [PropertyType.RURAL]:       { bg: 'var(--color-type-rural)',       text: 'var(--color-text-primary)', label: 'Rural' },
};

export const INSPECTOR_STATUS_MAP: Record<InspectorStatus, StatusStyle> = {
  [InspectorStatus.ACTIVE]:   { bg: 'var(--color-inspector-active)',   text: 'var(--color-text-primary)', label: 'Ativo' },
  [InspectorStatus.INACTIVE]: { bg: 'var(--color-inspector-inactive)', text: 'var(--color-text-primary)', label: 'Inativo' },
};
