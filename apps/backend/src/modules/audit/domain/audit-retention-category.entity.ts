import type { AuditRetentionCategory } from '@properfy/shared';

export interface AuditRetentionCategoryConfigProps {
  id: string;
  name: AuditRetentionCategory;
  retentionYears: number;
  hardDeleteEnabled: boolean;
  description: string | null;
  actionPatterns: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Feature 020: DB-backed retention category configuration. Replaces the
 * hardcoded tier durations in `audit-retention.ts` (which stays as a fallback).
 */
export class AuditRetentionCategoryConfigEntity {
  readonly id: string;
  readonly name: AuditRetentionCategory;
  retentionYears: number;
  hardDeleteEnabled: boolean;
  description: string | null;
  actionPatterns: string[];
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: AuditRetentionCategoryConfigProps) {
    this.id = props.id;
    this.name = props.name;
    this.retentionYears = props.retentionYears;
    this.hardDeleteEnabled = props.hardDeleteEnabled;
    this.description = props.description;
    this.actionPatterns = props.actionPatterns;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Retention period in milliseconds — derived from `retentionYears`. */
  retentionMs(): number {
    const YEARS_IN_MS = 365.25 * 24 * 60 * 60 * 1000;
    return this.retentionYears * YEARS_IN_MS;
  }
}
