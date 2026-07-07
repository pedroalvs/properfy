import { IntegrationProvider } from '@properfy/shared';

export interface ProviderFieldMeta {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
}

export interface ProviderMeta {
  provider: IntegrationProvider;
  label: string;
  icon: string;
  /** What stops working while this integration is unconfigured. */
  affectedCapability: string;
  fields: ProviderFieldMeta[];
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    provider: IntegrationProvider.RESEND,
    label: 'Resend',
    icon: 'mdi-email-outline',
    affectedCapability: 'Email sending',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true, placeholder: 're_...' },
      { key: 'fromEmail', label: 'From Email', secret: false, placeholder: 'no-reply@yourdomain.com' },
    ],
  },
  {
    provider: IntegrationProvider.MOBILE_MESSAGE,
    label: 'MobileMessage',
    icon: 'mdi-message-text-outline',
    affectedCapability: 'SMS sending',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true },
      { key: 'password', label: 'API Password', secret: true },
      { key: 'senderId', label: 'Sender ID', secret: false, placeholder: 'Properfy' },
      { key: 'webhookToken', label: 'Webhook Token', secret: true },
    ],
  },
  {
    provider: IntegrationProvider.MAPBOX,
    label: 'Mapbox',
    icon: 'mdi-map-marker-outline',
    affectedCapability: 'Address geocoding',
    fields: [{ key: 'accessToken', label: 'Access Token', secret: true, placeholder: 'pk. / sk. token' }],
  },
];
