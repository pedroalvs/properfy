import type { NotificationClass } from '@properfy/shared';

/**
 * Feature 018: visual chip for a notification's classification.
 * - TRANSACTIONAL: green — cannot be opted out
 * - OPERATIONAL: blue — recipient can opt out
 * - MARKETING: gray — opt-in only (not used in Phase 1)
 */

const CLASS_STYLES: Record<NotificationClass, { color: string; label: string; title: string }> = {
  TRANSACTIONAL: {
    color: 'bg-status-done text-status-done-text',
    label: 'Transactional',
    title: 'Always delivered. Recipients cannot opt out of transactional notifications.',
  },
  OPERATIONAL: {
    color: 'bg-status-scheduled text-status-scheduled-text',
    label: 'Operational',
    title: 'Delivered unless the recipient has opted out of this notification class.',
  },
  MARKETING: {
    color: 'bg-gray-200 text-gray-700',
    label: 'Marketing',
    title: 'Only delivered to recipients who have explicitly opted in.',
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
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${style.color} ${className}`}
      title={style.title}
    >
      {style.label}
    </span>
  );
}
