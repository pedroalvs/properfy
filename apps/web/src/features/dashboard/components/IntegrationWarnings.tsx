import { Link } from 'react-router-dom';
import type { IntegrationStatus } from '@properfy/shared';

import { InfoBanner } from '@/components/feedback/InfoBanner';
import { useIntegrationsStatus } from '@/features/integrations/hooks/useIntegrationsStatus';

const CAPABILITY_BY_PROVIDER: Record<string, { name: string; capability: string }> = {
  resend: { name: 'Resend', capability: 'Email sending' },
  mobile_message: { name: 'MobileMessage', capability: 'SMS sending' },
  mapbox: { name: 'Mapbox', capability: 'Address geocoding' },
};

/**
 * AM-only dashboard warnings: one banner per unconfigured outbound
 * integration, each explaining which capability is disabled and linking to
 * the Integrations Hub. Renders nothing for other roles (the status query is
 * disabled) or when everything is configured.
 */
export function IntegrationWarnings() {
  const { data: statuses } = useIntegrationsStatus();
  const missing = (statuses ?? []).filter((row: IntegrationStatus) => !row.configured);
  if (missing.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {missing.map((row) => {
        const meta = CAPABILITY_BY_PROVIDER[row.provider];
        if (!meta) return null;
        return (
          <InfoBanner key={row.provider} variant="warning">
            {meta.capability} is disabled — {meta.name} is not configured.{' '}
            <Link to="/integrations" className="font-medium underline">
              Configure in Integrations
            </Link>
          </InfoBanner>
        );
      })}
    </div>
  );
}
