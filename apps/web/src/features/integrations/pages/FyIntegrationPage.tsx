import { useGoBack } from '@/hooks/useGoBack';
import { ApiKeysTab } from '../components/ApiKeysTab';
import { ProviderLogo } from '../components/ProviderLogo';

/** Own page of the Fy inbound integration (API keys), at /integrations/fy-api. AM-only (guarded in the router). */
export function FyIntegrationPage() {
  const goBack = useGoBack('/integrations?tab=api-keys');

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        <i className="mdi mdi-arrow-left" aria-hidden="true" />
        API Keys
      </button>

      <section
        className="rounded bg-card-bg p-6 shadow-sm"
        style={{ borderTop: '4px solid #25D366' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <ProviderLogo logoKey="fy_webhook" brandColor="#25D366" size={56} />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-secondary">Fy Integration</h2>
            <p className="text-xs text-text-secondary">
              Inbound API access for the Fy WhatsApp agent — every key is restricted to the{' '}
              <code className="font-mono">bot:fy</code> scope
            </p>
          </div>
        </div>
      </section>

      <ApiKeysTab />
    </div>
  );
}
