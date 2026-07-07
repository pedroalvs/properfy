import type { ApiKeyResponse } from '@properfy/shared';

import type { IApiKeyRepository } from '../../domain/api-key';
import { toApiKeyResponse } from '../api-key.mapper';

export class ListApiKeysUseCase {
  constructor(private readonly repo: IApiKeyRepository) {}

  async execute(): Promise<ApiKeyResponse[]> {
    const keys = await this.repo.list();
    return keys.map(toApiKeyResponse);
  }
}
