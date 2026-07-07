import type { IntegrationProvider, IntegrationTestResult } from '@properfy/shared';

import type { IntegrationConfig } from './integration-setting';

/** Read-only "ping" against the provider using the given credentials. */
export interface IIntegrationConnectionTester {
  test(provider: IntegrationProvider, config: IntegrationConfig): Promise<IntegrationTestResult>;
}
