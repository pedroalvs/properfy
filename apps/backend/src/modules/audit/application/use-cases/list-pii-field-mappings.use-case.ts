import type { AuthContext } from '@properfy/shared';
import type { IPiiFieldMappingRepository } from '../../domain/pii-field-mapping.repository';
import type { PiiFieldMappingEntity } from '../../domain/pii-field-mapping.entity';
import { RetentionPolicyForbiddenError } from '../../domain/audit.errors';

export interface ListPiiFieldMappingsInput {
  actor: AuthContext;
}

/**
 * B6 #413: AM-only read of the PII field mapping registry. Mirrors the AM-only
 * RBAC of its write sibling (`UpsertPiiFieldMappingUseCase`).
 */
export class ListPiiFieldMappingsUseCase {
  constructor(private readonly repo: IPiiFieldMappingRepository) {}

  async execute(input: ListPiiFieldMappingsInput): Promise<PiiFieldMappingEntity[]> {
    if (input.actor.role !== 'AM') throw new RetentionPolicyForbiddenError();
    return this.repo.findAll();
  }
}
