import type {
  EmailSendResult,
  IEmailProvider,
  ISmsProvider,
  SmsDeliveryStatus,
  SmsSendOptions,
  SmsSendResult,
} from '../../notification/domain/providers';
import { ResendEmailProvider } from '../../notification/infrastructure/resend-email.provider';
import { StubEmailProvider } from '../../notification/infrastructure/stub-email.provider';
import { MobileMessageSmsProvider } from '../../notification/infrastructure/mobile-message-sms.provider';
import { StubSmsProvider } from '../../notification/infrastructure/stub-sms.provider';
import type { GeocodingResult, IGeocodingService } from '../../property/domain/geocoding.service';
import { MapboxGeocodingService } from '../../property/infrastructure/mapbox-geocoding.service';
import { StubGeocodingService } from '../../property/infrastructure/stub-geocoding.service';
import type {
  AddressLookupSuggestion,
  IAddressLookupService,
} from '../../property/domain/address-lookup.service';
import { MapboxAddressLookupService } from '../../property/infrastructure/mapbox-address-lookup.service';
import { StubAddressLookupService } from '../../property/infrastructure/stub-address-lookup.service';
import type { IntegrationConfig } from '../domain/integration-setting';
import type { IntegrationConfigResolver } from './integration-config-resolver';

// Delegating providers that resolve credentials per call instead of at boot.
// This is what lets AM manage Resend/MobileMessage/Mapbox from the Integrations
// Hub without a restart: the resolver applies database → env → stub precedence
// and the concrete provider is rebuilt only when the resolved config changes.

function configKey(config: IntegrationConfig, keys: string[]): string {
  // Newline separator keeps ['ab','c'] and ['a','bc'] distinct.
  return keys.map((key) => config[key] ?? '').join('\n');
}

export class DynamicEmailProvider implements IEmailProvider {
  private readonly stub = new StubEmailProvider();
  private current: { key: string; provider: IEmailProvider } | null = null;

  constructor(private readonly resolver: IntegrationConfigResolver) {}

  private async provider(): Promise<IEmailProvider> {
    const resolved = await this.resolver.getConfig('resend');
    if (!resolved) {
      this.current = null;
      return this.stub;
    }
    const key = configKey(resolved.config, ['apiKey', 'fromEmail']);
    if (this.current?.key !== key) {
      this.current = {
        key,
        provider: new ResendEmailProvider(
          resolved.config['apiKey'] ?? '',
          resolved.config['fromEmail'] ?? '',
        ),
      };
    }
    return this.current.provider;
  }

  async send(to: string, subject: string, bodyHtml: string, bodyText: string): Promise<EmailSendResult> {
    return (await this.provider()).send(to, subject, bodyHtml, bodyText);
  }
}

export class DynamicSmsProvider implements ISmsProvider {
  private readonly stub = new StubSmsProvider();
  private current: { key: string; provider: ISmsProvider } | null = null;

  constructor(private readonly resolver: IntegrationConfigResolver) {}

  private async provider(): Promise<ISmsProvider> {
    const resolved = await this.resolver.getConfig('mobile_message');
    if (!resolved) {
      this.current = null;
      return this.stub;
    }
    const key = configKey(resolved.config, ['apiKey', 'password', 'senderId']);
    if (this.current?.key !== key) {
      this.current = {
        key,
        provider: new MobileMessageSmsProvider(
          resolved.config['apiKey'] ?? '',
          resolved.config['password'] ?? '',
          resolved.config['senderId'] ?? '',
        ),
      };
    }
    return this.current.provider;
  }

  async send(to: string, bodyText: string, options?: SmsSendOptions): Promise<SmsSendResult> {
    return (await this.provider()).send(to, bodyText, options);
  }

  async getStatus(providerMessageId: string): Promise<SmsDeliveryStatus | null> {
    return (await this.provider()).getStatus(providerMessageId);
  }
}

export class DynamicGeocodingService implements IGeocodingService {
  private readonly stub = new StubGeocodingService();
  private current: { key: string; service: IGeocodingService } | null = null;

  constructor(private readonly resolver: IntegrationConfigResolver) {}

  private async service(): Promise<IGeocodingService> {
    const resolved = await this.resolver.getConfig('mapbox');
    if (!resolved) {
      this.current = null;
      return this.stub;
    }
    const key = resolved.config['accessToken'] ?? '';
    if (!this.current || this.current.key !== key) {
      this.current = { key, service: new MapboxGeocodingService(key) };
    }
    return this.current.service;
  }

  async geocode(address: string): Promise<GeocodingResult | null> {
    return (await this.service()).geocode(address);
  }
}

export class DynamicAddressLookupService implements IAddressLookupService {
  private readonly stub = new StubAddressLookupService();
  private current: { key: string; service: IAddressLookupService } | null = null;

  constructor(private readonly resolver: IntegrationConfigResolver) {}

  private async service(): Promise<IAddressLookupService> {
    const resolved = await this.resolver.getConfig('mapbox');
    if (!resolved) {
      this.current = null;
      return this.stub;
    }
    const key = resolved.config['accessToken'] ?? '';
    if (!this.current || this.current.key !== key) {
      this.current = { key, service: new MapboxAddressLookupService(key) };
    }
    return this.current.service;
  }

  async search(
    query: string,
    options?: { limit?: number; country?: string },
  ): Promise<AddressLookupSuggestion[]> {
    return (await this.service()).search(query, options);
  }
}
