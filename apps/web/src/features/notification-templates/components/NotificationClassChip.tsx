import type { NotificationClass } from '@properfy/shared';

/**
 * Feature 018: visual chip for a notification's classification.
 * - TRANSACTIONAL: green — cannot be opted out
 * - OPERATIONAL: blue — recipient can opt out
 * - MARKETING: gray — opt-in only (not used in Phase 1)
 */

const CLASS_STYLES: Record<NotificationClass, { color: string; label: string; title: string }> = {
  TRANSACTIONAL: {
    color: 'bg-[#C8E6C9] text-[#1B5E20]',
    label: 'Transactional',
    title: 'Always delivered. Recipients cannot opt out of transactional notifications.',
  },
  OPERATIONAL: {
    color: 'bg-[#B3E5FC] text-[#01579B]',
    label: 'Operational',
    title: 'Delivered unless the recipient has opted out via the unsubscribe link.',
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
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${style.color} ${className}`}
      title={style.title}
    >
      {style.label}
    </span>
  );
}
