import { BackButton } from '@/components/layout';
import { ApiKeysTab } from '../components/ApiKeysTab';
import { ProviderLogo } from '../components/ProviderLogo';
import type { MachineKeyType } from '../components/machineKeyType';

/**
 * Own page of an inbound machine-key integration (Fy agent, Mail Bot), at
 * /integrations/<slug>. AM-only (guarded in the router). Generic over the
 * integration descriptor so each one is a thin wrapper, not a copy.
 */
export function MachineKeyIntegrationPage({ keyType }: { keyType: MachineKeyType }) {
  return (
    <div className="space-y-4">
      <BackButton to="/integrations?tab=api-keys" />

      <section
        className="rounded bg-card-bg p-6 shadow-sm"
        style={{ borderTop: `4px solid ${keyType.brandColor}` }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <ProviderLogo logoKey={keyType.logoKey} brandColor={keyType.brandColor} size={56} />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-secondary">{keyType.label}</h2>
            <p className="text-xs text-text-secondary">{keyType.description}</p>
          </div>
        </div>
      </section>

      <ApiKeysTab keyType={keyType} />
    </div>
  );
}
