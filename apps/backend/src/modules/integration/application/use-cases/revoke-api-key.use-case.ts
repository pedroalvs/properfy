import type { ApiKeyResponse } from '@properfy/shared';

import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IApiKeyRepository } from '../../domain/api-key';
import { ApiKeyNotFoundError } from '../../domain/integration.errors';
import { toApiKeyResponse } from '../api-key.mapper';

export interface RevokeApiKeyInput {
  id: string;
  actorId: string;
}

export class RevokeApiKeyUseCase {
  constructor(
    private readonly repo: IApiKeyRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: RevokeApiKeyInput): Promise<ApiKeyResponse> {
    const key = await this.repo.findById(input.id);
    if (!key) throw new ApiKeyNotFoundError();

    // Idempotent: revoking an already-revoked key keeps the original timestamp.
    if (!key.revokedAt) {
      await this.repo.revoke(key.id);
      this.auditService.log({
        action: 'api_key.revoked',
        actorType: 'USER',
        actorId: input.actorId,
        entityType: 'api_key',
        entityId: key.id,
        tenantId: null,
        after: { name: key.name, prefix: key.prefix },
      });
    }

    const updated = await this.repo.findById(input.id);
    return toApiKeyResponse(updated ?? key);
  }
}
