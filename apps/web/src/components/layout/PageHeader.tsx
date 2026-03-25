import { Button } from '@/components/ui/Button';

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
}

export function PageHeader({ title, primaryAction, secondaryActions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-page-title-mobile text-secondary md:text-page-title">
        {title}
      </h1>
      <div className="flex items-center gap-2">
        {secondaryActions?.map((action) => (
          <Button
            key={action.label}
            variant="outlined"
            onClick={action.onClick}
            loading={action.loading}
            disabled={action.disabled}
          >
            {action.icon && <i className={`mdi ${action.icon}`} aria-hidden="true" />}
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
                <i className={`mdi ${primaryAction.icon}`} aria-hidden="true" />
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
                <i className={`mdi ${primaryAction.icon || 'mdi-plus'} text-2xl`} aria-hidden="true" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
