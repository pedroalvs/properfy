import type { UserRole } from '@properfy/shared';
import { USER_ROLE_MAP } from '@/lib/status-colors';

interface UserRoleChipProps {
  role: UserRole;
  className?: string;
}

export function UserRoleChip({ role, className = '' }: UserRoleChipProps) {
  const style = USER_ROLE_MAP[role];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
