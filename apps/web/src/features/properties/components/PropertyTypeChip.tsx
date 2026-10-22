import type { PropertyType } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { PROPERTY_TYPE_MAP } from '@/lib/status-colors';

interface PropertyTypeChipProps {
  type: PropertyType;
  className?: string;
}

export function PropertyTypeChip({ type, className = '' }: PropertyTypeChipProps) {
  const style = PROPERTY_TYPE_MAP[type];
  if (!style) return null;

  return (
    <span
      className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5', className)}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
