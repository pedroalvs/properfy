import { describe, it, expect } from 'vitest';
import { AppointmentStatus, PropertyType, InspectorStatus, ServiceGroupStatus, PriorityMode, UserRole, UserStatus, FinancialEntryType, FinancialEntryStatus, TenantConfirmationStatus, ReportType, ReportStatus } from '@properfy/shared';
import { APPOINTMENT_STATUS_MAP, getStatusStyle, PROPERTY_TYPE_MAP, INSPECTOR_STATUS_MAP, SERVICE_GROUP_STATUS_MAP, PRIORITY_MODE_MAP, USER_ROLE_MAP, USER_STATUS_MAP, FINANCIAL_ENTRY_TYPE_MAP, FINANCIAL_ENTRY_STATUS_MAP, TENANT_CONFIRMATION_STATUS_MAP, REPORT_TYPE_MAP, REPORT_STATUS_MAP } from './status-colors';

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

describe('SERVICE_GROUP_STATUS_MAP', () => {
  const allStatuses: ServiceGroupStatus[] = [
    ServiceGroupStatus.DRAFT,
    ServiceGroupStatus.PUBLISHED,
    ServiceGroupStatus.ACCEPTED,
    ServiceGroupStatus.CANCELLED,
  ];

  it('maps all 4 service group statuses', () => {
    expect(Object.keys(SERVICE_GROUP_STATUS_MAP)).toHaveLength(4);
    for (const status of allStatuses) {
      expect(SERVICE_GROUP_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = SERVICE_GROUP_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.DRAFT].label).toBe('Rascunho');
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.PUBLISHED].label).toBe('Publicado');
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.ACCEPTED].label).toBe('Aceito');
    expect(SERVICE_GROUP_STATUS_MAP[ServiceGroupStatus.CANCELLED].label).toBe('Cancelado');
  });
});

describe('PRIORITY_MODE_MAP', () => {
  const allModes: PriorityMode[] = [
    PriorityMode.STANDARD,
    PriorityMode.PRIORITY_24H,
  ];

  it('maps both priority modes', () => {
    expect(Object.keys(PRIORITY_MODE_MAP)).toHaveLength(2);
    for (const mode of allModes) {
      expect(PRIORITY_MODE_MAP[mode]).toBeDefined();
    }
  });

  it.each(allModes)('mode %s has bg, text, and label', (mode) => {
    const style = PRIORITY_MODE_MAP[mode];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(PRIORITY_MODE_MAP[PriorityMode.STANDARD].label).toBe('Padrão');
    expect(PRIORITY_MODE_MAP[PriorityMode.PRIORITY_24H].label).toBe('Prioridade 24h');
  });
});

describe('USER_ROLE_MAP', () => {
  const allRoles: UserRole[] = [
    UserRole.AM,
    UserRole.OP,
    UserRole.CL_ADMIN,
    UserRole.CL_USER,
    UserRole.INSP,
    UserRole.TNT,
  ];

  it('maps all 6 user roles', () => {
    expect(Object.keys(USER_ROLE_MAP)).toHaveLength(6);
    for (const role of allRoles) {
      expect(USER_ROLE_MAP[role]).toBeDefined();
    }
  });

  it.each(allRoles)('role %s has bg, text, and label', (role) => {
    const style = USER_ROLE_MAP[role];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(USER_ROLE_MAP[UserRole.AM].label).toBe('Admin Master');
    expect(USER_ROLE_MAP[UserRole.OP].label).toBe('Operador');
    expect(USER_ROLE_MAP[UserRole.CL_ADMIN].label).toBe('Admin Cliente');
    expect(USER_ROLE_MAP[UserRole.CL_USER].label).toBe('Usuário Cliente');
    expect(USER_ROLE_MAP[UserRole.INSP].label).toBe('Inspetor');
    expect(USER_ROLE_MAP[UserRole.TNT].label).toBe('Inquilino');
  });
});

describe('USER_STATUS_MAP', () => {
  const allStatuses: UserStatus[] = [
    UserStatus.ACTIVE,
    UserStatus.INACTIVE,
    UserStatus.LOCKED,
  ];

  it('maps all 3 user statuses', () => {
    expect(Object.keys(USER_STATUS_MAP)).toHaveLength(3);
    for (const status of allStatuses) {
      expect(USER_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = USER_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(USER_STATUS_MAP[UserStatus.ACTIVE].label).toBe('Ativo');
    expect(USER_STATUS_MAP[UserStatus.INACTIVE].label).toBe('Inativo');
    expect(USER_STATUS_MAP[UserStatus.LOCKED].label).toBe('Bloqueado');
  });
});

describe('FINANCIAL_ENTRY_TYPE_MAP', () => {
  const allTypes: FinancialEntryType[] = [
    FinancialEntryType.TENANT_DEBIT,
    FinancialEntryType.INSPECTOR_PAYOUT,
    FinancialEntryType.REFUND,
    FinancialEntryType.MANUAL_ADJUSTMENT,
  ];

  it('maps all 4 financial entry types', () => {
    expect(Object.keys(FINANCIAL_ENTRY_TYPE_MAP)).toHaveLength(4);
    for (const type of allTypes) {
      expect(FINANCIAL_ENTRY_TYPE_MAP[type]).toBeDefined();
    }
  });

  it.each(allTypes)('type %s has bg, text, and label', (type) => {
    const style = FINANCIAL_ENTRY_TYPE_MAP[type];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.TENANT_DEBIT].label).toBe('Débito Inquilino');
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.INSPECTOR_PAYOUT].label).toBe('Pagamento Inspetor');
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.REFUND].label).toBe('Reembolso');
    expect(FINANCIAL_ENTRY_TYPE_MAP[FinancialEntryType.MANUAL_ADJUSTMENT].label).toBe('Ajuste Manual');
  });
});

describe('FINANCIAL_ENTRY_STATUS_MAP', () => {
  const allStatuses: FinancialEntryStatus[] = [
    FinancialEntryStatus.PENDING,
    FinancialEntryStatus.APPROVED,
    FinancialEntryStatus.CANCELLED,
  ];

  it('maps all 3 financial entry statuses', () => {
    expect(Object.keys(FINANCIAL_ENTRY_STATUS_MAP)).toHaveLength(3);
    for (const status of allStatuses) {
      expect(FINANCIAL_ENTRY_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = FINANCIAL_ENTRY_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(FINANCIAL_ENTRY_STATUS_MAP[FinancialEntryStatus.PENDING].label).toBe('Pendente');
    expect(FINANCIAL_ENTRY_STATUS_MAP[FinancialEntryStatus.APPROVED].label).toBe('Aprovado');
    expect(FINANCIAL_ENTRY_STATUS_MAP[FinancialEntryStatus.CANCELLED].label).toBe('Cancelado');
  });
});

describe('TENANT_CONFIRMATION_STATUS_MAP', () => {
  const allStatuses: TenantConfirmationStatus[] = [
    TenantConfirmationStatus.PENDING,
    TenantConfirmationStatus.CONFIRMED,
    TenantConfirmationStatus.UNAVAILABLE,
    TenantConfirmationStatus.NO_RESPONSE,
  ];

  it('maps all 4 tenant confirmation statuses', () => {
    expect(Object.keys(TENANT_CONFIRMATION_STATUS_MAP)).toHaveLength(4);
    for (const status of allStatuses) {
      expect(TENANT_CONFIRMATION_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = TENANT_CONFIRMATION_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.PENDING].label).toBe('Pendente');
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.CONFIRMED].label).toBe('Confirmado');
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.UNAVAILABLE].label).toBe('Indisponível');
    expect(TENANT_CONFIRMATION_STATUS_MAP[TenantConfirmationStatus.NO_RESPONSE].label).toBe('Sem Resposta');
  });
});

describe('REPORT_TYPE_MAP', () => {
  const allTypes: ReportType[] = [
    ReportType.INSPECTIONS_SCHEDULED,
    ReportType.INSPECTIONS_DONE,
    ReportType.INSPECTIONS_CANCELLED,
    ReportType.INSPECTIONS_REJECTED,
    ReportType.INSPECTOR_PERFORMANCE,
    ReportType.CONFIRMATION_STATUS,
    ReportType.FINANCIAL_SERVICES,
  ];

  it('maps all 7 report types', () => {
    expect(Object.keys(REPORT_TYPE_MAP)).toHaveLength(7);
    for (const type of allTypes) {
      expect(REPORT_TYPE_MAP[type]).toBeDefined();
    }
  });

  it.each(allTypes)('type %s has bg, text, and label', (type) => {
    const style = REPORT_TYPE_MAP[type];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_SCHEDULED].label).toBe('Vistorias Agendadas');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_DONE].label).toBe('Vistorias Concluídas');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_CANCELLED].label).toBe('Vistorias Canceladas');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTIONS_REJECTED].label).toBe('Vistorias Rejeitadas');
    expect(REPORT_TYPE_MAP[ReportType.INSPECTOR_PERFORMANCE].label).toBe('Desempenho Inspetores');
    expect(REPORT_TYPE_MAP[ReportType.CONFIRMATION_STATUS].label).toBe('Status Confirmação');
    expect(REPORT_TYPE_MAP[ReportType.FINANCIAL_SERVICES].label).toBe('Serviços Financeiros');
  });
});

describe('REPORT_STATUS_MAP', () => {
  const allStatuses: ReportStatus[] = [
    ReportStatus.PENDING,
    ReportStatus.PROCESSING,
    ReportStatus.READY,
    ReportStatus.FAILED,
  ];

  it('maps all 4 report statuses', () => {
    expect(Object.keys(REPORT_STATUS_MAP)).toHaveLength(4);
    for (const status of allStatuses) {
      expect(REPORT_STATUS_MAP[status]).toBeDefined();
    }
  });

  it.each(allStatuses)('status %s has bg, text, and label', (status) => {
    const style = REPORT_STATUS_MAP[status];
    expect(style.bg).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.label).toBeTruthy();
  });

  it('returns correct labels in pt-BR', () => {
    expect(REPORT_STATUS_MAP[ReportStatus.PENDING].label).toBe('Pendente');
    expect(REPORT_STATUS_MAP[ReportStatus.PROCESSING].label).toBe('Processando');
    expect(REPORT_STATUS_MAP[ReportStatus.READY].label).toBe('Pronto');
    expect(REPORT_STATUS_MAP[ReportStatus.FAILED].label).toBe('Falhou');
  });
});
