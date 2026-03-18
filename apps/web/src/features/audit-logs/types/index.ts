export interface AuditLog {
  id: string;
  tenantId: string | null;
  actorType: string;
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  reason: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  requestId: string | null;
  ipAddress: string | null;
  metadataJson: unknown | null;
  createdAt: string;
}

export interface AuditLogFiltersState {
  search: string;
  entityType: string;
  action: string;
  startDate: string;
  endDate: string;
}

export const DEFAULT_FILTERS: AuditLogFiltersState = {
  search: '',
  entityType: '',
  action: '',
  startDate: '',
  endDate: '',
};
