import type { IntegrationProvider, IntegrationTestResult } from '@properfy/shared';

import type { IIntegrationConnectionTester } from '../../domain/integration-connection-tester';
import type { IntegrationConfigResolver } from '../../infrastructure/integration-config-resolver';

export interface TestIntegrationConnectionInput {
  provider: IntegrationProvider;
}

/** Pings the provider with the currently resolved credentials (db → env). */
export class TestIntegrationConnectionUseCase {
  constructor(
    private readonly resolver: IntegrationConfigResolver,
    private readonly tester: IIntegrationConnectionTester,
  ) {}

  async execute(input: TestIntegrationConnectionInput): Promise<IntegrationTestResult> {
    const resolved = await this.resolver.getConfig(input.provider);
    if (!resolved) {
      return { ok: false, message: 'Integration is not configured (no database or env credentials)' };
    }
    try {
      return await this.tester.test(input.provider, resolved.config);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Connection test failed' };
    }
  }
}
