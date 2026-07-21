import { createHash, randomBytes } from 'node:crypto';

import { API_KEY_PLAINTEXT_PREFIX, type ApiKeyCreated, type ApiKeyRole } from '@properfy/shared';

import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IApiKeyRepository } from '../../domain/api-key';
import { toApiKeyResponse } from '../api-key.mapper';

export interface CreateApiKeyInput {
  name: string;
  role: ApiKeyRole;
  expiresAt: string | null;
  scopes?: string[];
  actorId: string;
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export class CreateApiKeyUseCase {
  constructor(
    private readonly repo: IApiKeyRepository,
    private readonly auditService: AuditService,
  ) {}

  /** Returns the plaintext key exactly once — it is never retrievable again. */
  async execute(input: CreateApiKeyInput): Promise<ApiKeyCreated> {
    const plaintext = `${API_KEY_PLAINTEXT_PREFIX}${randomBytes(32).toString('base64url')}`;

    const created = await this.repo.create({
      name: input.name,
      keyHash: hashApiKey(plaintext),
      prefix: plaintext.slice(0, 12),
      role: input.role,
      scopes: input.scopes ?? [],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdById: input.actorId,
    });

    this.auditService.log({
      action: 'api_key.created',
      actorType: 'USER',
      actorId: input.actorId,
      entityType: 'api_key',
      entityId: created.id,
      tenantId: null,
      // Never log the plaintext key or its hash.
      after: {
        name: created.name,
        prefix: created.prefix,
        role: created.role,
        scopes: created.scopes,
        expiresAt: input.expiresAt,
      },
    });

    return { ...toApiKeyResponse(created), key: plaintext };
  }
}
