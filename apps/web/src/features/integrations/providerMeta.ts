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
  /** Optional warning shown on the card, e.g. to disambiguate from a related but separate integration. */
  note?: string;
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
    provider: IntegrationProvider.FY_WEBHOOK,
    label: 'Fy Agent Webhook',
    icon: 'mdi-robot-outline',
    affectedCapability: 'Fy proactive WhatsApp messages',
    fields: [
      { key: 'url', label: 'Webhook URL', secret: false, placeholder: 'https://n8n.example.com/webhook/fy' },
      { key: 'secret', label: 'Shared Secret', secret: true },
    ],
  },
  {
    provider: IntegrationProvider.MAPBOX,
    label: 'Mapbox',
    icon: 'mdi-map-marker-outline',
    affectedCapability: 'Address geocoding',
    fields: [{ key: 'accessToken', label: 'Access Token', secret: true, placeholder: 'pk. / sk. token' }],
    note: 'This token is used by the backend for address geocoding only — it does not affect the maps shown in the app. To change the map tiles token, contact support.',
  },
];
