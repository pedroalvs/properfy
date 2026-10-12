import { TopBar } from '@/components/shell/TopBar';
import { InspectorDetailsCard } from '../components/InspectorDetailsCard';

export function ProfileDocumentsPage() {
  return (
    <div className="w-full pb-20">
      <TopBar title="Documents" showBack backTo="/profile" backHideOnWide />

      <div className="flex flex-col gap-4 p-4">
        <InspectorDetailsCard />
      </div>
    </div>
  );
}
