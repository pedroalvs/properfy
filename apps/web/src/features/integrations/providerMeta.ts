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
  /** URL segment of the provider's own page: /integrations/<slug>. */
  slug: string;
  /** Brand background behind the white logo glyph. */
  brandColor: string;
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
    slug: 'resend',
    brandColor: '#0F0F10',
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
    slug: 'mobile-message',
    brandColor: '#00B36B',
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
    slug: 'fy-webhook',
    brandColor: '#25D366',
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
    slug: 'mapbox',
    brandColor: '#4264FB',
    affectedCapability: 'Address geocoding',
    fields: [{ key: 'accessToken', label: 'Access Token', secret: true, placeholder: 'pk. / sk. token' }],
    note: 'This token is used by the backend for address geocoding only — it does not affect the maps shown in the app. To change the map tiles token, contact support.',
  },
];

export function findProviderMetaBySlug(slug: string | undefined): ProviderMeta | undefined {
  return PROVIDER_META.find((meta) => meta.slug === slug);
}
