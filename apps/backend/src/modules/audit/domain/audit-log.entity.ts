export interface AuditLogProps {
  id: string;
  tenantId: string | null;
  actorType: 'USER' | 'SYSTEM' | 'ANONYMOUS';
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  reason: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
  requestId: string | null;
  ipAddress: string | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: Date;
}

export class AuditLogEntity {
  readonly id: string;
  readonly tenantId: string | null;
  readonly actorType: 'USER' | 'SYSTEM' | 'ANONYMOUS';
  readonly actorId: string | null;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly action: string;
  readonly reason: string | null;
  readonly beforeJson: unknown | null;
  readonly afterJson: unknown | null;
  readonly requestId: string | null;
  readonly ipAddress: string | null;
  readonly metadataJson: Record<string, unknown> | null;
  readonly createdAt: Date;

  constructor(props: AuditLogProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.actorType = props.actorType;
    this.actorId = props.actorId;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.action = props.action;
    this.reason = props.reason;
    this.beforeJson = props.beforeJson;
    this.afterJson = props.afterJson;
    this.requestId = props.requestId;
    this.ipAddress = props.ipAddress;
    this.metadataJson = props.metadataJson;
    this.createdAt = props.createdAt;
  }
}
