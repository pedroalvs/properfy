import { AppointmentStatus, PropertyType, InspectorStatus, ServiceGroupStatus, PriorityMode, UserRole, UserStatus, FinancialEntryType, FinancialEntryStatus, TenantConfirmationStatus, ReportType, ReportStatus, GeocodingStatus } from '@properfy/shared';

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

export const FINANCIAL_ENTRY_TYPE_MAP: Record<FinancialEntryType, StatusStyle> = {
  [FinancialEntryType.TENANT_DEBIT]:      { bg: 'var(--color-fin-type-debit)',      text: 'var(--color-text-primary)', label: 'Tenant Debit' },
  [FinancialEntryType.INSPECTOR_PAYOUT]:  { bg: 'var(--color-fin-type-payout)',     text: 'var(--color-text-primary)', label: 'Inspector Payout' },
  [FinancialEntryType.REFUND]:            { bg: 'var(--color-fin-type-refund)',     text: 'var(--color-text-primary)', label: 'Refund' },
  [FinancialEntryType.MANUAL_ADJUSTMENT]: { bg: 'var(--color-fin-type-adjustment)', text: 'var(--color-text-primary)', label: 'Manual Adjustment' },
};

export const FINANCIAL_ENTRY_STATUS_MAP: Record<FinancialEntryStatus, StatusStyle> = {
  [FinancialEntryStatus.PENDING]:   { bg: 'var(--color-fin-status-pending)',   text: 'var(--color-text-primary)', label: 'Pending' },
  [FinancialEntryStatus.APPROVED]:  { bg: 'var(--color-fin-status-approved)',  text: 'var(--color-text-primary)', label: 'Approved' },
  [FinancialEntryStatus.CANCELLED]: { bg: 'var(--color-fin-status-cancelled)', text: 'var(--color-text-primary)', label: 'Cancelled' },
};

export const TENANT_CONFIRMATION_STATUS_MAP: Record<TenantConfirmationStatus, StatusStyle> = {
  [TenantConfirmationStatus.PENDING]:     { bg: 'var(--color-confirmation-pending)',     text: 'var(--color-text-primary)', label: 'Pendente' },
  [TenantConfirmationStatus.CONFIRMED]:   { bg: 'var(--color-confirmation-confirmed)',   text: 'var(--color-text-primary)', label: 'Confirmado' },
  [TenantConfirmationStatus.UNAVAILABLE]: { bg: 'var(--color-confirmation-unavailable)', text: 'var(--color-text-primary)', label: 'Indisponível' },
  [TenantConfirmationStatus.NO_RESPONSE]: { bg: 'var(--color-confirmation-no-response)', text: 'var(--color-text-primary)', label: 'Sem Resposta' },
};

export const GEOCODING_STATUS_MAP: Record<GeocodingStatus, StatusStyle> = {
  [GeocodingStatus.PENDING]:  { bg: 'var(--color-geocoding-pending)',  text: 'var(--color-text-primary)', label: 'Pendente' },
  [GeocodingStatus.SUCCESS]:  { bg: 'var(--color-geocoding-success)',  text: 'var(--color-text-primary)', label: 'Sucesso' },
  [GeocodingStatus.FAILED]:   { bg: 'var(--color-geocoding-failed)',   text: 'var(--color-text-primary)', label: 'Falhou' },
  [GeocodingStatus.MANUAL]:   { bg: 'var(--color-geocoding-manual)',   text: 'var(--color-text-primary)', label: 'Manual' },
};

export const REPORT_TYPE_MAP: Record<ReportType, StatusStyle> = {
  [ReportType.INSPECTIONS_SCHEDULED]: { bg: 'var(--color-report-type-scheduled)',    text: 'var(--color-text-primary)', label: 'Vistorias Agendadas' },
  [ReportType.INSPECTIONS_DONE]:      { bg: 'var(--color-report-type-done)',         text: 'var(--color-text-primary)', label: 'Vistorias Concluídas' },
  [ReportType.INSPECTIONS_CANCELLED]: { bg: 'var(--color-report-type-cancelled)',    text: 'var(--color-text-primary)', label: 'Vistorias Canceladas' },
  [ReportType.INSPECTIONS_REJECTED]:  { bg: 'var(--color-report-type-rejected)',     text: 'var(--color-text-primary)', label: 'Vistorias Rejeitadas' },
  [ReportType.INSPECTOR_PERFORMANCE]: { bg: 'var(--color-report-type-performance)',  text: 'var(--color-text-primary)', label: 'Desempenho Inspetores' },
  [ReportType.CONFIRMATION_STATUS]:   { bg: 'var(--color-report-type-confirmation)', text: 'var(--color-text-primary)', label: 'Status Confirmação' },
  [ReportType.FINANCIAL_SERVICES]:    { bg: 'var(--color-report-type-financial)',    text: 'var(--color-text-primary)', label: 'Serviços Financeiros' },
};

export const REPORT_STATUS_MAP: Record<ReportStatus, StatusStyle> = {
  [ReportStatus.PENDING]:    { bg: 'var(--color-report-status-pending)',    text: 'var(--color-text-primary)', label: 'Pendente' },
  [ReportStatus.PROCESSING]: { bg: 'var(--color-report-status-processing)', text: 'var(--color-text-primary)', label: 'Processando' },
  [ReportStatus.READY]:      { bg: 'var(--color-report-status-ready)',      text: 'var(--color-text-primary)', label: 'Pronto' },
  [ReportStatus.FAILED]:     { bg: 'var(--color-report-status-failed)',     text: 'var(--color-text-primary)', label: 'Falhou' },
};
