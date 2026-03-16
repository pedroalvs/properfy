import { Button } from '@/components/ui/Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title,
  description,
  icon = 'mdi-inbox-outline',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <i className={`mdi ${icon} text-[48px] text-text-muted`} aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-text-primary">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          <Button variant="outlined" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
