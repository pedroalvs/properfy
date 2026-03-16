import { AppointmentStatus } from '@properfy/shared';

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
