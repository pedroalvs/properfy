import { IntegrationProvider, type IntegrationDetail } from '@properfy/shared';

import type { IIntegrationSettingRepository } from '../../domain/integration-setting';
import type { IntegrationConfigResolver } from '../../infrastructure/integration-config-resolver';
import { maskIntegrationConfig } from '../mask-integration-config';

/**
 * Read model for the Integrations Hub screen: one row per managed provider
 * with resolution status and the masked view of whichever config is active
 * (database or env fallback).
 */
export class ListIntegrationsUseCase {
  constructor(
    private readonly repo: IIntegrationSettingRepository,
    private readonly resolver: IntegrationConfigResolver,
  ) {}

  async execute(): Promise<IntegrationDetail[]> {
    const [statusRows, dbRows] = await Promise.all([
      this.resolver.getStatus(),
      this.repo.list(),
    ]);
    const dbByProvider = new Map(dbRows.map((row) => [row.provider, row]));

    return Promise.all(
      Object.values(IntegrationProvider).map(async (provider) => {
        const status = statusRows.find((row) => row.provider === provider) ?? {
          provider,
          configured: false,
          source: 'none' as const,
          enabled: true,
        };
        const dbRow = dbByProvider.get(provider);
        // Mask whichever config the resolver would actually use; for a
        // disabled or incomplete DB row, still show the stored (masked) values
        // so the operator can see what is saved.
        const active = dbRow?.config ?? (await this.resolver.getConfig(provider))?.config ?? null;
        return {
          ...status,
          maskedConfig: maskIntegrationConfig(provider, active),
          updatedAt: dbRow?.updatedAt.toISOString() ?? null,
        };
      }),
    );
  }
}
