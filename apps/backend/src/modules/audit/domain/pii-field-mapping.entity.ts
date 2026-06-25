import type { PiiClassification } from '@properfy/shared';

export interface PiiFieldMappingProps {
  id: string;
  actionPattern: string;
  jsonFieldPath: string;
  classification: PiiClassification;
  requiresManualReview: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Feature 020: one entry in the DB-backed PII field registry. Replaces the
 * hardcoded `PII_REGISTRY` array as the source of truth at runtime (the array
 * stays in `pii-redaction.ts` as a seed / fallback).
 */
export class PiiFieldMappingEntity {
  readonly id: string;
  readonly actionPattern: string;
  readonly jsonFieldPath: string;
  readonly classification: PiiClassification;
  readonly requiresManualReview: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: PiiFieldMappingProps) {
    this.id = props.id;
    this.actionPattern = props.actionPattern;
    this.jsonFieldPath = props.jsonFieldPath;
    this.classification = props.classification;
    this.requiresManualReview = props.requiresManualReview;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Returns true if the given action matches this mapping's prefix rule. */
  appliesTo(action: string): boolean {
    return this.actionPattern === '' || action.startsWith(this.actionPattern);
  }
}
