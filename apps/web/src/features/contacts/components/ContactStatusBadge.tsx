import { cn } from '@properfy/frontend-standards';

interface ContactStatusBadgeProps {
  isActive: boolean;
  className?: string;
}

export function ContactStatusBadge({ isActive, className = '' }: ContactStatusBadgeProps) {
  const bg = isActive ? 'var(--color-inspector-active)' : 'var(--color-inspector-inactive)';
  return (
    <span
      className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5', className)}
      style={{ backgroundColor: bg, color: 'var(--color-text-primary)' }}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}
