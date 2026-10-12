import type { ReactNode } from 'react';
import { cn } from '@properfy/frontend-standards';

type TwoPaneVariant = 'master' | 'canvas';
type DetailMode = 'inline' | 'overlay';

interface TwoPaneLayoutProps {
  /** Left pane: the list or menu (always the "master"). */
  master: ReactNode;
  /** Right pane content shown when something is selected (a routed `<Outlet/>` or a panel). */
  detail: ReactNode;
  /** Right pane content shown on wide screens when nothing is selected. */
  emptyState: ReactNode;
  /** Whether a detail is currently selected (routing- or state-derived by the caller). */
  hasSelection: boolean;
  /**
   * Column template. `master` = narrow fixed list on the left (Schedule, Profile).
   * `canvas` = flexible master on the left with a fixed detail on the right (Marketplace map/list).
   */
  variant?: TwoPaneVariant;
  /**
   * Phone collapse behaviour. `inline` (default): master and detail swap by selection — the
   * validated single-column separate-route stack. `overlay`: the master always stays on phone
   * because the caller renders its own bottom-sheet overlay for the detail, so the inline detail
   * pane is tablet-only.
   */
  detailMode?: DetailMode;
}

const GRID_VARIANTS: Record<TwoPaneVariant, string> = {
  master: 'md:grid-cols-[minmax(320px,360px)_1fr]',
  canvas: 'md:grid-cols-[1fr_minmax(340px,400px)]',
};

/**
 * Adaptive master-detail frame. On phone (<md) it is a single column that collapses per
 * `detailMode`, so the validated phone experience is unchanged. At `md` (≥768px) it becomes two
 * columns — the structure is pure CSS (`md:` utilities) plus the caller's `hasSelection`, so no
 * viewport JS is needed for Schedule/Profile.
 */
export function TwoPaneLayout({
  master,
  detail,
  emptyState,
  hasSelection,
  variant = 'master',
  detailMode = 'inline',
}: TwoPaneLayoutProps) {
  const masterHiddenOnPhone = detailMode === 'inline' && hasSelection;
  const detailHiddenOnPhone = detailMode === 'overlay' || !hasSelection;

  return (
    <div className={cn('w-full md:grid', GRID_VARIANTS[variant])} data-testid="two-pane-layout">
      <div
        className={cn('min-w-0', masterHiddenOnPhone && 'hidden md:block')}
        data-testid="two-pane-master"
      >
        {master}
      </div>
      <div
        className={cn(
          'min-w-0 md:border-l md:border-border',
          detailHiddenOnPhone && 'hidden md:block',
        )}
        data-testid="two-pane-detail"
      >
        {hasSelection ? detail : emptyState}
      </div>
    </div>
  );
}
