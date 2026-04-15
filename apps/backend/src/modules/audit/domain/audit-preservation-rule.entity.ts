import type { PreservationRuleType } from '@properfy/shared';

export interface AuditPreservationRuleProps {
  id: string;
  name: string;
  ruleType: PreservationRuleType;
  entityType: string | null;
  entityId: string | null;
  tenantId: string | null;
  isActive: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Feature 020: generic preservation rule that exempts audit entries from
 * retention actions. Two rule types are supported:
 *   - CROSS_CHECK: inline guard in the worker (non-disableable, not persisted as a rule row)
 *   - LEGAL_HOLD: persisted as a row; evaluated via `AuditLegalHoldEntity`
 *
 * Feature 020 FR-009 `ACTIVE_DISPUTE` was removed in Sprint 1 W-5 (2026-04-13).
 * See `specs/020-audit-retention-pii-redaction/spec.md` Delivery Outcome.
 */
export class AuditPreservationRuleEntity {
  readonly id: string;
  name: string;
  readonly ruleType: PreservationRuleType;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly tenantId: string | null;
  isActive: boolean;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: AuditPreservationRuleProps) {
    this.id = props.id;
    this.name = props.name;
    this.ruleType = props.ruleType;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.tenantId = props.tenantId;
    this.isActive = props.isActive;
    this.createdByUserId = props.createdByUserId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Returns true when this rule exempts the given audit-log target from retention. */
  matches(entityType: string, entityId: string | null, tenantId: string | null): boolean {
    if (!this.isActive) return false;
    if (this.entityType !== null && this.entityType !== entityType) return false;
    if (this.entityId !== null && this.entityId !== entityId) return false;
    if (this.tenantId !== null && this.tenantId !== tenantId) return false;
    return true;
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }
}
