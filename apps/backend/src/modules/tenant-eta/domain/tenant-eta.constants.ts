/** Tenant arrival-notice template codes (F06). One code, two channel rows each. */
export const TENANT_ETA_TEMPLATE_CODES = {
  MORNING: 'TENANT_ETA_MORNING',
  ON_THE_WAY: 'TENANT_ETA_ON_THE_WAY',
  DELAY: 'TENANT_ETA_DELAY',
} as const;

export type TenantEtaKind = 'MORNING' | 'ON_THE_WAY' | 'DELAY';
