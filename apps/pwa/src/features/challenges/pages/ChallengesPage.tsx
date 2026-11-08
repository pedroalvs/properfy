import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Segmented } from '@/components/ui/Segmented';
import { useInspectorProgram } from '../hooks/useInspectorProgram';
import { ActiveGoalsTab } from '../components/ActiveGoalsTab';
import { MyResultsTab } from '../components/MyResultsTab';
import { RankingTab } from '../components/RankingTab';

type ChallengeTab = 'active' | 'results' | 'ranking';

const TAB_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'results', label: 'My results' },
  { id: 'ranking', label: 'Ranking' },
] as const satisfies ReadonlyArray<{ id: ChallengeTab; label: string }>;

function isTab(value: string | null): value is ChallengeTab {
  return value === 'active' || value === 'results' || value === 'ranking';
}

/**
 * The inspector's Challenges screen (03.10/03.15/03.A3): Active, My results and
 * Ranking tabs over one `GET /v1/inspector/program` read. Back returns to the
 * More hub. Dates are rendered from the server's Sydney civil values.
 */
export function ChallengesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: ChallengeTab = isTab(rawTab) ? rawTab : 'active';

  const { data, isLoading, isError, refetch } = useInspectorProgram();
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  function selectTab(next: ChallengeTab) {
    setSearchParams(next === 'active' ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="w-full pb-20">
      <TopBar title="Challenges" showBack backTo="/profile" backHideOnWide />
      <div className="flex flex-col gap-4 px-page-x">
        {isLoading && !data ? (
          <LoadingState rows={3} />
        ) : isError && !data ? (
          <ErrorState message="Couldn't load your challenges." retryLabel="Try again" onRetry={() => void refetch()} />
        ) : data ? (
          <>
            {offline && (
              <p className="rounded-card bg-muted px-3 py-2 text-xs text-muted-foreground">
                You're offline. Showing your last update.
              </p>
            )}
            <Segmented<ChallengeTab> value={tab} options={TAB_OPTIONS} onChange={selectTab} aria-label="Challenges tabs" />
            {tab === 'active' && <ActiveGoalsTab program={data} />}
            {tab === 'results' && <MyResultsTab program={data} />}
            {tab === 'ranking' && <RankingTab ranking={data.ranking} />}
          </>
        ) : null}
      </div>
    </div>
  );
}
