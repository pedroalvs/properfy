import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { WidePaneProvider, STICKY_HEADER } from './WidePaneContext';

type TwoPaneVariant = 'master' | 'canvas';
type DetailMode = 'inline' | 'overlay';

interface TwoPaneLayoutProps {
  /** Right pane (tablet): the list or menu (always the "master"), full width until a detail expands. */
  master: ReactNode;
  /** Left pane (tablet): the detail, shown only while something is selected. */
  detail: ReactNode;
  /** Whether a detail is currently selected (routing- or state-derived by the caller). */
  hasSelection: boolean;
  /** Collapse the detail pane (clear the selection). Shown as a close control while open. */
  onClose: () => void;
  /** Render the frame's close control. Set false when the detail content already provides its own. */
  showClose?: boolean;
  /**
   * Open-width of the detail pane. `master` = detail is the primary reading pane (wide, Schedule /
   * Profile). `canvas` = detail is a secondary panel so the master map/list keeps the width (Marketplace).
   */
  variant?: TwoPaneVariant;
  /**
   * Phone collapse behaviour. `inline` (default): master and detail swap by selection — the validated
   * single-column separate-route stack. `overlay`: the master always stays on phone because the caller
   * renders its own bottom-sheet overlay, so the inline detail pane is tablet-only.
   */
  detailMode?: DetailMode;
  /**
   * At `md`+, bound the frame to the viewport (minus the fixed-nav clearance) and give each pane
   * its own scroll region, instead of letting the whole document body scroll. Off by default so
   * overlay/map consumers (Marketplace) are unaffected. Opt in only for inline master-detail
   * screens whose panes are tall reading surfaces (Schedule / Profile / Invoices). Also pins each
   * pane's `TopBar` to its top via `WidePaneContext`.
   */
  fillHeight?: boolean;
}

// Open width of the detail pane at the tablet breakpoint. The master is `flex-1` and reflows into the
// remaining space, so transitioning this width animates both panes together.
const DETAIL_OPEN_WIDTH: Record<TwoPaneVariant, string> = {
  master: 'md:w-[58%] lg:w-[62%]',
  canvas: 'md:w-[42%] lg:w-[40%]',
};

/**
 * Adaptive master-detail frame. On phone (<md) it is a single column that collapses per `detailMode`,
 * so the validated phone experience is unchanged. At `md` (≥768px) the detail pane is collapsed to
 * zero width until something is selected, then expands in from the left with a brief width/opacity
 * animation (the master, on the right, is `flex-1` and reflows to match). A close control collapses it.
 */
export function TwoPaneLayout({
  master,
  detail,
  hasSelection,
  onClose,
  showClose = true,
  variant = 'master',
  detailMode = 'inline',
  fillHeight = false,
}: TwoPaneLayoutProps) {
  // Phone: `inline` swaps master and detail by selection; `overlay` keeps the master and the caller
  // owns the detail overlay (so the inline detail pane is tablet-only).
  const detailHiddenOnPhone = detailMode === 'overlay' || !hasSelection;
  const masterHiddenOnPhone = detailMode === 'inline' && hasSelection;

  const frame = (
    <div
      className={cn(
        'w-full md:flex',
        // Bound the frame to the viewport minus the fixed-nav clearance so each pane (below) can own
        // its own scroll; `<main>`'s existing `pb-nav-clear` fills the remaining space the nav floats
        // over. `md:` only — phone keeps the validated single-column body scroll.
        fillHeight && 'md:h-[calc(100dvh-theme(spacing.nav-clear))] md:overflow-hidden',
      )}
      data-testid="two-pane-layout"
    >
      {/* Detail — left column on tablet (inverted), width animates open/closed. */}
      <div
        className={cn(
          'min-w-0',
          detailHiddenOnPhone ? 'hidden md:block' : 'block',
          'md:shrink-0 md:transition-[width,opacity] md:duration-200 md:ease-out',
          // `fillHeight`: keep the horizontal clip the width open/close animation relies on, but
          // scroll vertically within the pane. Otherwise keep the original both-axes clip.
          fillHeight
            ? 'md:h-full md:overflow-x-hidden md:overflow-y-auto'
            : 'md:overflow-hidden',
          hasSelection
            ? cn('md:border-r md:border-border md:opacity-100', DETAIL_OPEN_WIDTH[variant])
            : 'md:w-0 md:opacity-0',
        )}
        data-testid="two-pane-detail"
        aria-hidden={!hasSelection}
      >
        {hasSelection && (
          <div>
            {showClose && (
              // Tablet-only close row ABOVE the detail's own TopBar. Keeping it on its own row (not an
              // absolute top-right overlay) means it never sits on top of the sub-page TopBar's
              // right-side indicators (offline / queued). The sub-page back chevron stays hidden on wide.
              <div
                className="hidden md:flex md:justify-end md:px-2 md:pt-2"
                data-testid="two-pane-close-bar"
              >
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close details"
                  data-testid="two-pane-close"
                  className="flex min-h-touch min-w-touch items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            )}
            {detail}
          </div>
        )}
      </div>

      {/* Master — right column on tablet, fills the remaining space. */}
      <div
        className={cn(
          'min-w-0 md:flex-1',
          fillHeight && 'md:h-full md:overflow-y-auto',
          masterHiddenOnPhone && 'hidden md:block',
        )}
        data-testid="two-pane-master"
      >
        {master}
      </div>
    </div>
  );

  // When the panes own their scroll, tell the headers inside them to pin to the pane top.
  return fillHeight ? <WidePaneProvider value={STICKY_HEADER}>{frame}</WidePaneProvider> : frame;
}
