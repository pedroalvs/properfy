import { Inbox, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** The empty-state glyph; defaults to a neutral inbox. */
  icon?: LucideIcon;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-page-x">
      <Icon className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
