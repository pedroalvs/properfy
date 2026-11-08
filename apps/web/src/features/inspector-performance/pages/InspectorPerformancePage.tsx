import { useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resolvePlatformSettingValue, type InspectorLevelThresholds } from '@properfy/shared';
import { usePlatformSetting } from '@/features/platform-settings/hooks/usePlatformSetting';
import { PageHeader } from '@/components/layout/PageHeader';
import { InfoBanner } from '@/components/feedback/InfoBanner';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useReliabilityRanking } from '../hooks/useReliabilityRanking';
import { FreshnessBanners } from '../components/FreshnessBanners';
import { RankingTable } from '../components/RankingTable';
import { NotEnoughDataList } from '../components/NotEnoughDataList';
import { ReliabilityDrawer } from '../components/ReliabilityDrawer';
import { formatReliabilityDateRange, formatReliabilityInstant } from '../lib/format-metric';

const CONFIGURE_WEIGHTS_TO = '/platform-settings#reliability-index';
const PRIVACY_NOTE = 'Only operations staff can see this page. Agencies never see scores or rankings.';
const LOADING_LABEL = 'Loading inspector performance';
const LOAD_ERROR = "We couldn't load inspector performance.";

/**
 * Inspector performance (03.11 + 03.12) — the AM/OP reliability ranking plus a
 * deep-linkable metric drawer. The `?inspector=` search param drives the drawer;
 * the page owns focus restore to the originating row control (DrawerPanel does
 * not). AM/OP only (route guard); agencies never see scores (D4).
 */
export function InspectorPerformancePage() {
  const { ranking, isLoading, isError, refetch } = useReliabilityRanking();
  // Level thresholds for the derived "Level" column (F08 03.11). Null while the
  // setting loads or if it can't be read → the column shows "–".
  const programSetting = usePlatformSetting('inspectorProgram');
  const levelThresholds = useMemo<InspectorLevelThresholds | null>(() => {
    if (programSetting.isLoading || programSetting.isError || !programSetting.setting) return null;
    const resolved = resolvePlatformSettingValue('inspectorProgram', programSetting.setting.value);
    // A stored value that fails validation is treated as unreadable → "–" (the
    // column is informational; don't derive levels from a corrupted setting).
    return resolved.valid ? resolved.value.levels : null;
  }, [programSetting.setting, programSetting.isLoading, programSetting.isError]);
  const [searchParams, setSearchParams] = useSearchParams();
  // Normalize an empty `?inspector=` to null: `""` is not null, so without this
  // the drawer would open while its detail query stays disabled (Boolean("") is
  // false) → a stuck skeleton with no not-found/retry.
  const inspectorId = searchParams.get('inspector') || null;
  const triggerRef = useRef<HTMLElement | null>(null);

  const openInspector = useCallback(
    (id: string, trigger: HTMLElement | null) => {
      triggerRef.current = trigger;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('inspector', id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const closeInspector = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('inspector');
        return next;
      },
      { replace: true },
    );
    const trigger = triggerRef.current;
    triggerRef.current = null;
    trigger?.focus();
  }, [setSearchParams]);

  const subtitle =
    ranking && ranking.snapshotDate
      ? `Last 30 days · ${formatReliabilityDateRange(ranking.windowFrom, ranking.windowTo)} · Updated ${formatReliabilityInstant(ranking.computedAt)}`
      : null;

  return (
    <div>
      <PageHeader title="Inspector performance">
        <Link
          to={CONFIGURE_WEIGHTS_TO}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <i className="mdi mdi-tune-variant" aria-hidden="true" />
          Configure weights
        </Link>
      </PageHeader>

      {subtitle && <p className="-mt-3 mb-4 text-sm text-text-secondary">{subtitle}</p>}

      <InfoBanner variant="info" className="mb-4">
        {PRIVACY_NOTE}
      </InfoBanner>

      {ranking && (
        <div className="mb-4">
          <FreshnessBanners
            isStale={ranking.isStale}
            snapshotDate={ranking.snapshotDate}
            settingsUpdatedAt={ranking.settingsUpdatedAt}
            computedAt={ranking.computedAt}
          />
        </div>
      )}

      {isError ? (
        <ErrorState message={LOAD_ERROR} onRetry={() => refetch()} />
      ) : isLoading || !ranking ? (
        <div>
          <span className="sr-only">{LOADING_LABEL}</span>
          <LoadingState rows={6} variant="table" />
        </div>
      ) : ranking.snapshotDate === null ? (
        <EmptyState
          title="No scores yet"
          description="Scores are calculated every night. The first ranking appears after the next run."
        />
      ) : (
        <>
          <RankingTable rows={ranking.ranked} onOpen={openInspector} levelThresholds={levelThresholds} />
          <NotEnoughDataList
            items={ranking.notEnoughData}
            minimumVolume={ranking.minimumVolume}
            onOpen={openInspector}
          />
        </>
      )}

      <ReliabilityDrawer inspectorId={inspectorId} onClose={closeInspector} />
    </div>
  );
}
