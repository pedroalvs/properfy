import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { TabsNav } from '@/components/layout/TabsNav';
import { GoalsTab } from '../components/GoalsTab';
import { RewardsTab } from '../components/RewardsTab';

/** Shared Back-button fallback for the sub-pages and this page's own history base. */
export const BACK_TO = '/goals-rewards?tab=goals';

const TABS = [
  { id: 'goals', label: 'Goals' },
  { id: 'rewards', label: 'Rewards' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string | null): value is TabId {
  return value === 'goals' || value === 'rewards';
}

/**
 * Goals & rewards (F08-3, AM/OP). Two tabs: Goals (define/manage goals) and
 * Rewards (promised × achieved, approve/void). Platform-scoped program (D12); the
 * route guard is AM/OP-only (Q18). The active tab lives in `?tab=goals|rewards`.
 */
export function GoalsRewardsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabId = isTabId(tabParam) ? tabParam : 'goals';

  const setTab = (tab: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div>
      <PageHeader title="Goals & rewards" />
      <p className="-mt-3 mb-4 text-sm text-text-secondary">
        Set goals for inspectors and review the rewards they earn.
      </p>

      <TabsNav tabs={[...TABS]} activeTab={activeTab} onChange={setTab} />

      <div className="mt-6">{activeTab === 'goals' ? <GoalsTab /> : <RewardsTab />}</div>
    </div>
  );
}
