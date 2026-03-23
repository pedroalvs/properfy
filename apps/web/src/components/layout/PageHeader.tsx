import { Button } from '@/components/ui/Button';

export interface PageHeaderAction {
  label: string;
  icon?: string;
  onClick: () => void;
  loading?: boolean;
}

interface PageHeaderProps {
  title: string;
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
}

export function PageHeader({ title, primaryAction, secondaryActions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
          >
            {action.icon && <i className={`mdi ${action.icon}`} aria-hidden="true" />}
            {action.label}
          </Button>
        ))}
        {primaryAction && (
          <Button
            variant="primary"
            onClick={primaryAction.onClick}
            loading={primaryAction.loading}
          >
            {primaryAction.icon && (
              <i className={`mdi ${primaryAction.icon}`} aria-hidden="true" />
            )}
            {primaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
