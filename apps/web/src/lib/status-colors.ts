import { AppointmentStatus, PropertyType, InspectorStatus, ServiceGroupStatus, PriorityMode, UserRole, UserStatus } from '@properfy/shared';

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

export const SERVICE_GROUP_STATUS_MAP: Record<ServiceGroupStatus, StatusStyle> = {
  [ServiceGroupStatus.DRAFT]:     { bg: 'var(--color-sg-draft)',     text: 'var(--color-text-primary)', label: 'Rascunho' },
  [ServiceGroupStatus.PUBLISHED]: { bg: 'var(--color-sg-published)', text: 'var(--color-text-primary)', label: 'Publicado' },
  [ServiceGroupStatus.ACCEPTED]:  { bg: 'var(--color-sg-accepted)',  text: 'var(--color-text-primary)', label: 'Aceito' },
  [ServiceGroupStatus.CANCELLED]: { bg: 'var(--color-sg-cancelled)', text: 'var(--color-text-primary)', label: 'Cancelado' },
};

export const PRIORITY_MODE_MAP: Record<PriorityMode, StatusStyle> = {
  [PriorityMode.STANDARD]:     { bg: 'var(--color-priority-standard)', text: 'var(--color-text-primary)', label: 'Padrão' },
  [PriorityMode.PRIORITY_24H]: { bg: 'var(--color-priority-24h)',      text: 'var(--color-text-primary)', label: 'Prioridade 24h' },
};

export const USER_ROLE_MAP: Record<UserRole, StatusStyle> = {
  [UserRole.AM]:       { bg: 'var(--color-role-am)',       text: 'var(--color-text-primary)', label: 'Admin Master' },
  [UserRole.OP]:       { bg: 'var(--color-role-op)',       text: 'var(--color-text-primary)', label: 'Operador' },
  [UserRole.CL_ADMIN]: { bg: 'var(--color-role-cl-admin)', text: 'var(--color-text-primary)', label: 'Admin Cliente' },
  [UserRole.CL_USER]:  { bg: 'var(--color-role-cl-user)',  text: 'var(--color-text-primary)', label: 'Usuário Cliente' },
  [UserRole.INSP]:     { bg: 'var(--color-role-insp)',     text: 'var(--color-text-primary)', label: 'Inspetor' },
  [UserRole.TNT]:      { bg: 'var(--color-role-tnt)',      text: 'var(--color-text-primary)', label: 'Inquilino' },
};

export const USER_STATUS_MAP: Record<UserStatus, StatusStyle> = {
  [UserStatus.ACTIVE]:   { bg: 'var(--color-user-active)',   text: 'var(--color-text-primary)', label: 'Ativo' },
  [UserStatus.INACTIVE]: { bg: 'var(--color-user-inactive)', text: 'var(--color-text-primary)', label: 'Inativo' },
  [UserStatus.LOCKED]:   { bg: 'var(--color-user-locked)',   text: 'var(--color-text-primary)', label: 'Bloqueado' },
};
