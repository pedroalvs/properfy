import { CalendarDays, CheckCircle2, Inbox, Tag, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}

// Call sites still pass the legacy mdi identifiers; map the ones in use to lucide
// equivalents and fall back to a neutral inbox glyph for anything else.
const iconMap: Record<string, LucideIcon> = {
  'mdi-inbox-outline': Inbox,
  'mdi-calendar-blank': CalendarDays,
  'mdi-tag-off-outline': Tag,
  'mdi-check-circle-outline': CheckCircle2,
};

export function EmptyState({
  title,
  description,
  icon = 'mdi-inbox-outline',
  action,
}: EmptyStateProps) {
  const Icon = iconMap[icon] ?? Inbox;

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
