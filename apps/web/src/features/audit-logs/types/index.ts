export interface AuditLog {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
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
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  fromDate: string;
  toDate: string;
}

export const DEFAULT_FILTERS: AuditLogFiltersState = {
  actorId: '',
  entityType: '',
  entityId: '',
  action: '',
  fromDate: '',
  toDate: '',
};
