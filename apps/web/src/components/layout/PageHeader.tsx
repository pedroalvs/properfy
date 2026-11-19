import type { ReactNode } from 'react';
import { cn } from '@properfy/frontend-standards';
import { Button } from '@/components/ui/Button';
import { BackButton } from './BackButton';

export interface PageHeaderAction {
  label: string;
  icon?: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface PageHeaderProps {
  title: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  /**
   * Arbitrary controls for the right of the header, rendered before the action
   * buttons. For scope selectors that govern the whole page (the Inspector
   * Workload week picker), which are neither a primary nor a secondary action.
   */
  children?: ReactNode;
  /**
   * Parent screen for the header Back button. When set, a `BackButton` renders before the title.
   * When absent, no Back button is rendered and no router hook is called, so the header still
   * works outside a router. Sub-screens pass this; top-level screens omit it.
   */
  backTo?: string;
  /** Back override, forwarded to the `BackButton`. Ignored when `backTo` is absent. */
  onBack?: (goBack: () => void) => void;
}

export function PageHeader({ title, primaryAction, secondaryActions, children, backTo, onBack }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {backTo ? (
        // Only wrap the title when a Back button is present, so pages without backTo keep the
        // exact prior DOM (the bare <h1> directly under the header row).
        <div className="flex items-center gap-3">
          <BackButton to={backTo} onClick={onBack} />
          <h1 className="text-page-title-mobile text-secondary md:text-page-title">
            {title}
          </h1>
        </div>
      ) : (
        <h1 className="text-page-title-mobile text-secondary md:text-page-title">
          {title}
        </h1>
      )}
      <div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:items-center">
        {children}
        {secondaryActions?.map((action) => (
          <Button
            key={action.label}
            variant="outlined"
            onClick={action.onClick}
            loading={action.loading}
            disabled={action.disabled}
            className="w-full justify-center sm:w-auto"
          >
            {action.icon && <i className={cn('mdi', action.icon)} aria-hidden="true" />}
            {action.label}
          </Button>
        ))}
        {primaryAction && (
          <>
            {/* Desktop button */}
            <Button
              variant="primary"
              onClick={primaryAction.onClick}
              loading={primaryAction.loading}
              disabled={primaryAction.disabled}
              className="hidden sm:inline-flex"
            >
              {primaryAction.icon && (
                <i className={cn('mdi', primaryAction.icon)} aria-hidden="true" />
              )}
              {primaryAction.label}
            </Button>
            {/* Mobile FAB */}
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.loading}
              className="fixed bottom-[30px] right-[10px] z-30 flex h-16 w-16 items-center justify-center rounded-full bg-real-estate text-white shadow-[0_6px_12px_0_rgba(0,0,0,0.15),0_1px_5px_0_rgba(0,0,0,0.45)] transition-transform active:scale-90 disabled:opacity-40 sm:hidden"
              aria-label={primaryAction.label}
            >
              {primaryAction.loading ? (
                <i className="mdi mdi-loading mdi-spin text-2xl" aria-hidden="true" />
              ) : (
                <i className={cn('mdi', primaryAction.icon || 'mdi-plus', 'text-2xl')} aria-hidden="true" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
