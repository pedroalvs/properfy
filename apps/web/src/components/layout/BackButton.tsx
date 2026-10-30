import { cn } from '@properfy/frontend-standards';
import { useGoBack } from '@/hooks/useGoBack';

export interface BackButtonProps {
  /**
   * Parent screen, used as the fallback when there is no in-app history (direct link, refresh,
   * new tab, or an entry reached only through a login/redirect). May include a query string.
   */
  to: string;
  /**
   * Override: when provided it is called instead of navigating, and receives the button's own
   * `goBack` (same `to` fallback). The page decides what to do — open a discard confirmation,
   * ignore the click, or call the received `goBack`. The button never navigates on its own.
   */
  onClick?: (goBack: () => void) => void;
  className?: string;
}

/**
 * Standard header Back button: icon + visible "Back" text. Must be rendered inside a router (it
 * calls `useGoBack(to)`). Top-level (sidebar) screens do not use it.
 */
export function BackButton({ to, onClick, className }: BackButtonProps) {
  const goBack = useGoBack(to);

  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (onClick ? onClick(goBack) : goBack())}
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-medium text-text-secondary',
        'hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <i className="mdi mdi-arrow-left text-xl" aria-hidden="true" />
      <span>Back</span>
    </button>
  );
}
