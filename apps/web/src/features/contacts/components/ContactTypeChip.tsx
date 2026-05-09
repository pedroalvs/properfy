import type { ContactType } from '@properfy/shared';
import { CONTACT_TYPE_MAP } from '@/lib/status-colors';

interface ContactTypeChipProps {
  type: ContactType;
  className?: string;
}

export function ContactTypeChip({ type, className = '' }: ContactTypeChipProps) {
  const style = CONTACT_TYPE_MAP[type];
  if (!style) return null;

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
