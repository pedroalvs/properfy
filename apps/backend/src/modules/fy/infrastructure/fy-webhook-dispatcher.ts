import type { FyWebhookEvent } from '@properfy/shared';
import { IntegrationProvider } from '@properfy/shared';

import type { IntegrationConfigResolver } from '../../integration/infrastructure/integration-config-resolver';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * POSTs Fy events to the configured n8n endpoint. Throwing on failure is the
 * retry mechanism — the pg-boss worker re-runs the job with backoff.
 */
export class FyWebhookDispatcher {
  constructor(private readonly configResolver: IntegrationConfigResolver) {}

  async deliver(event: FyWebhookEvent): Promise<void> {
    const resolved = await this.configResolver.getConfig(IntegrationProvider.FY_WEBHOOK);
    if (!resolved) {
      // Config was removed after enqueue — drop silently rather than retry forever.
      return;
    }

    const response = await fetch(resolved.config['url']!, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': resolved.config['secret']!,
        'x-fy-event': event.event,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Fy webhook delivery failed with HTTP ${response.status}`);
    }
  }
}
