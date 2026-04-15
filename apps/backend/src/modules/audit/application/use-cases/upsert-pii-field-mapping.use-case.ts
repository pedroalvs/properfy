import type { AuthContext, PiiClassification } from '@properfy/shared';
import type { IPiiFieldMappingRepository } from '../../domain/pii-field-mapping.repository';
import type { PersistentAuditService } from '../services/persistent-audit.service';
import { PiiFieldMappingEntity } from '../../domain/pii-field-mapping.entity';
import {
  PiiMappingNotFoundError,
  RetentionPolicyForbiddenError,
} from '../../domain/audit.errors';

export interface UpsertPiiFieldMappingInput {
  id?: string;
  actionPattern: string;
  jsonFieldPath: string;
  classification: PiiClassification;
  requiresManualReview: boolean;
  actor: AuthContext;
}

/**
 * Feature 020 US5: AM-only upsert of a PII field mapping. Emits
 * `audit.pii_field_mapping_upserted`.
 */
export class UpsertPiiFieldMappingUseCase {
  constructor(
    private readonly repo: IPiiFieldMappingRepository,
    private readonly auditService: PersistentAuditService,
  ) {}

  async execute(input: UpsertPiiFieldMappingInput): Promise<string> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();

    const existing = input.id ? await this.repo.findById(input.id) : null;
    if (input.id && !existing) throw new PiiMappingNotFoundError();

    const before = existing
      ? {
          actionPattern: existing.actionPattern,
          jsonFieldPath: existing.jsonFieldPath,
          classification: existing.classification,
          requiresManualReview: existing.requiresManualReview,
        }
      : null;

    const entity = new PiiFieldMappingEntity({
      id: existing?.id ?? crypto.randomUUID(),
      actionPattern: input.actionPattern,
      jsonFieldPath: input.jsonFieldPath,
      classification: input.classification,
      requiresManualReview: input.requiresManualReview,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });

    if (existing) {
      await this.repo.update(entity);
    } else {
      await this.repo.save(entity);
    }

    this.auditService.log({
      actorType: 'USER',
      actorId: input.actor.userId,
      entityType: 'PiiFieldMapping',
      entityId: entity.id,
      action: 'audit.pii_field_mapping_upserted',
      tenantId: input.actor.tenantId ?? undefined,
      before,
      after: {
        actionPattern: entity.actionPattern,
        jsonFieldPath: entity.jsonFieldPath,
        classification: entity.classification,
        requiresManualReview: entity.requiresManualReview,
      },
    });

    return entity.id;
  }
}
