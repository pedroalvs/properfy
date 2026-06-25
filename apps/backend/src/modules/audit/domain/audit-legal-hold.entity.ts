export interface AuditLegalHoldProps {
  id: string;
  entityType: string;
  entityId: string;
  tenantId: string | null;
  reason: string;
  placedByUserId: string;
  placedAt: Date;
  releasedByUserId: string | null;
  releasedAt: Date | null;
  isActive: boolean;
}

/**
 * Feature 020: AM-placed legal hold on a specific audit target. Per-entity,
 * non-category-wide. Preserves any matching audit entries from retention
 * processing until the hold is released.
 */
export class AuditLegalHoldEntity {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly tenantId: string | null;
  readonly reason: string;
  readonly placedByUserId: string;
  readonly placedAt: Date;
  releasedByUserId: string | null;
  releasedAt: Date | null;
  isActive: boolean;

  constructor(props: AuditLegalHoldProps) {
    this.id = props.id;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.tenantId = props.tenantId;
    this.reason = props.reason;
    this.placedByUserId = props.placedByUserId;
    this.placedAt = props.placedAt;
    this.releasedByUserId = props.releasedByUserId;
    this.releasedAt = props.releasedAt;
    this.isActive = props.isActive;
  }

  /** Returns true when this hold preserves the given audit-log target. */
  matches(entityType: string, entityId: string | null, tenantId: string | null): boolean {
    if (!this.isActive) return false;
    if (this.entityType !== entityType) return false;
    if (this.entityId !== entityId) return false;
    if (this.tenantId !== null && this.tenantId !== tenantId) return false;
    return true;
  }

  release(userId: string): void {
    if (!this.isActive) {
      throw new Error('Legal hold already released');
    }
    this.isActive = false;
    this.releasedByUserId = userId;
    this.releasedAt = new Date();
  }
}
