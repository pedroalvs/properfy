import type { UserStatus } from '@properfy/shared';
import { USER_STATUS_MAP } from '@/lib/status-colors';

interface UserStatusChipProps {
  status: UserStatus;
  className?: string;
}

export function UserStatusChip({ status, className = '' }: UserStatusChipProps) {
  const style = USER_STATUS_MAP[status];
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
