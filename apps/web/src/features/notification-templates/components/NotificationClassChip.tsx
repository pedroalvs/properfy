import type { NotificationClass } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';

/**
 * Visual chip for a notification's classification.
 * - TRANSACTIONAL: green — always sent; not counted against the daily cap
 * - OPERATIONAL: blue — counts against the agency's daily cap
 * - MARKETING: gray — not sent
 */

const CLASS_STYLES: Record<NotificationClass, { color: string; label: string; title: string }> = {
  TRANSACTIONAL: {
    color: 'bg-status-done text-status-done-text',
    label: 'Transactional',
    title: 'Always delivered. Not counted against the daily sending cap when sent platform-wide.',
  },
  OPERATIONAL: {
    color: 'bg-status-scheduled text-status-scheduled-text',
    label: 'Operational',
    title: "Counts against the agency's daily sending cap.",
  },
  MARKETING: {
    color: 'bg-gray-200 text-gray-700',
    label: 'Marketing',
    title: 'Marketing messages are not sent.',
  },
};

interface NotificationClassChipProps {
  notificationClass: NotificationClass;
  className?: string;
}

export function NotificationClassChip({ notificationClass, className = '' }: NotificationClassChipProps) {
  const style = CLASS_STYLES[notificationClass];
  return (
    <span
      data-variant={notificationClass}
      className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold', style.color, className)}
      title={style.title}
    >
      {style.label}
    </span>
  );
}
