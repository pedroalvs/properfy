import { PageHeader } from '@/components/layout/PageHeader';
import { TotpSetupCard } from '../components/TotpSetupCard';
import { SessionTable } from '../components/SessionTable';

export function SecuritySettingsPage() {
  return (
    <div>
      <PageHeader title="Security Settings" />

      <div className="flex flex-col gap-6">
        <TotpSetupCard />
        <SessionTable />
      </div>
    </div>
  );
}
