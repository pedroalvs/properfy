import { getTemplateTarget, type NotificationTarget } from '../types';

/**
 * Who receives a template. The recipient is not a field on the template row — it is decided
 * at each dispatch site — so the mapping lives in `TEMPLATE_TARGETS` (shared) and this chip
 * only presents it. Colours deliberately avoid the Channel (#B3E5FC / #FFE0B2) and Class
 * (#C8E6C9 / #B3E5FC / gray-200) palettes, since all three chips sit in the same table row.
 */
const TARGET_STYLES: Record<NotificationTarget, { color: string; label: string; title: string }> = {
  RENTAL_TENANT: {
    color: 'bg-[#E1BEE7] text-[#4A148C]',
    label: 'Tenant',
    title: 'Sent to the rental tenant (occupant) contact on the appointment.',
  },
  PROPERTY_MANAGER: {
    color: 'bg-[#C5CAE9] text-[#1A237E]',
    label: 'Property Manager',
    title: 'Sent to the branch contact email — the property manager, not the occupant.',
  },
  INSPECTOR: {
    color: 'bg-[#B2DFDB] text-[#004D40]',
    label: 'Inspector',
    title: 'Sent to the inspector assigned to the service group.',
  },
  USER_ACCOUNT: {
    color: 'bg-[#D7CCC8] text-[#3E2723]',
    label: 'User Account',
    title: 'Sent to a platform or agency user account — the person who triggered the action.',
  },
  PLATFORM_OPS: {
    color: 'bg-[#CFD8DC] text-[#263238]',
    label: 'Properfy Ops',
    title: 'Sent to the Properfy operations inbox — an internal alert, never customer-facing.',
  },
};

interface NotificationTargetChipProps {
  /** Template code — the chip resolves the target itself, so callers never repeat the lookup. */
  templateCode: string;
  className?: string;
}

export function NotificationTargetChip({ templateCode, className = '' }: NotificationTargetChipProps) {
  const target = getTemplateTarget(templateCode);

  // Custom templates can carry a code outside both catalogs, so there is nothing to declare.
  if (!target) {
    return <span className={`text-sm text-text-secondary ${className}`}>—</span>;
  }

  const style = TARGET_STYLES[target];
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${style.color} ${className}`}
      title={style.title}
    >
      {style.label}
    </span>
  );
}
