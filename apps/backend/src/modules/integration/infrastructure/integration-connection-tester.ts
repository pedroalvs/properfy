import type { IntegrationProvider, IntegrationTestResult } from '@properfy/shared';

import type { IIntegrationConnectionTester } from '../domain/integration-connection-tester';
import type { IntegrationConfig } from '../domain/integration-setting';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Read-only connectivity checks — no test call may produce a side effect
 * (no email/SMS is ever sent from here):
 * - Resend: GET /domains (any 2xx proves the API key).
 * - MobileMessage: GET /v1/messages lookup with a probe id (200/404 prove
 *   Basic Auth; 401/403 mean bad credentials).
 * - Mapbox: forward-geocode a fixed string (200 proves the token).
 */
export class HttpIntegrationConnectionTester implements IIntegrationConnectionTester {
  async test(provider: IntegrationProvider, config: IntegrationConfig): Promise<IntegrationTestResult> {
    switch (provider) {
      case 'resend':
        return this.testResend(config);
      case 'mobile_message':
        return this.testMobileMessage(config);
      case 'mapbox':
        return this.testMapbox(config);
    }
  }

  private async testResend(config: IntegrationConfig): Promise<IntegrationTestResult> {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${config['apiKey'] ?? ''}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true, message: 'Resend API key is valid' };
    // A sending_access-scoped key cannot list domains: Resend answers with a
    // "restricted_api_key" error. That still proves the key authenticates, so
    // report it as valid rather than failing send-only production keys.
    const body = await response.text();
    if (body.includes('restricted_api_key')) {
      return { ok: true, message: 'Resend API key is valid (send-only scope)' };
    }
    return { ok: false, message: `Resend rejected the credentials (HTTP ${response.status})` };
  }

  private async testMobileMessage(config: IntegrationConfig): Promise<IntegrationTestResult> {
    const auth = Buffer.from(`${config['apiKey'] ?? ''}:${config['password'] ?? ''}`).toString('base64');
    const response = await fetch(
      'https://api.mobilemessage.com.au/v1/messages?message_id=connection-test',
      {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: `MobileMessage rejected the credentials (HTTP ${response.status})` };
    }
    if (response.ok || response.status === 404) {
      return { ok: true, message: 'MobileMessage credentials are valid' };
    }
    return { ok: false, message: `MobileMessage returned an unexpected status (HTTP ${response.status})` };
  }

  private async testMapbox(config: IntegrationConfig): Promise<IntegrationTestResult> {
    const token = encodeURIComponent(config['accessToken'] ?? '');
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/Sydney.json?limit=1&access_token=${token}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (response.ok) return { ok: true, message: 'Mapbox access token is valid' };
    return { ok: false, message: `Mapbox rejected the token (HTTP ${response.status})` };
  }
}
